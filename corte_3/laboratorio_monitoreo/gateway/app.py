from flask import Flask, request, jsonify
import requests
import time

app = Flask(__name__)

@app.route("/")
def home():
    print(f"[GATEWAY] Servicio funcionando correctamente", flush=True)
    return "GATEWAY FUNCIONANDO"


@app.route("/inventario")
def inventario():
    data, status = safe_request("inventario", "http://inventario:5000/inventario")
    return jsonify(data), status


@app.route("/pedidos")
def pedidos():
    data, status = safe_request("pedidos", "http://pedidos:5000/pedidos")
    return jsonify(data), status


@app.route("/pagos")
def pagos():
    data, status = safe_request("pagos", "http://pagos:5000/pagos")
    return jsonify(data), status

# Estados iniciales de los servicios
circuit_states = {
    "inventario": {"fallos": 0, "abierto": False, "ultimo_fallo_tiempo": 0},
    "pedidos": {"fallos": 0, "abierto": False, "ultimo_fallo_tiempo": 0},
    "pagos": {"fallos": 0, "abierto": False, "ultimo_fallo_tiempo": 0}
}

TIEMPO_ESPERA = 20  # segundos


def safe_request(name, url):

    state = circuit_states[name]
    ahora = time.time()

    print(f"[INFO] Tiempo de espera configurado: {TIEMPO_ESPERA}s", flush=True)

    if state["abierto"]:

        tiempo_transcurrido = ahora - state["ultimo_fallo_tiempo"]

        if tiempo_transcurrido > TIEMPO_ESPERA:
            print(f"[{name.upper()}] Recuperando servicio (HALF-OPEN)", flush=True)
        else:
            print(f"[{name.upper()}] Circuito abierto", flush=True)

            return {
                "error": f"Circuito abierto: servicio {name} bloqueado"
            }, 503

    inicio = time.time()

    try:

        print(f"[GATEWAY] Llamando servicio {name}...", flush=True)

        response = requests.get(url, timeout=2)

        if response.status_code != 200:

            print(
                f"[ERROR] {name} respondió con status {response.status_code}",
                flush=True
            )

            raise Exception(
                f"Backend respondió con {response.status_code}"
            )

        data = response.json()
        if not data:

            print(f"[ERROR] {name} no devolvió datos", flush=True)

            return {
                "error": f"No hay datos en {name}"
            }, 404

        state["fallos"] = 0
        state["abierto"] = False

        print(f"[GATEWAY] Servicio {name} respondió correctamente", flush=True)

        return data, 200

    except requests.exceptions.ConnectionError:

        print(f"[ERROR] No se pudo conectar con {name}", flush=True)

        state["fallos"] += 1
        state["ultimo_fallo_tiempo"] = time.time()

    except requests.exceptions.Timeout:

        print(f"[ERROR] Timeout en servicio {name}", flush=True)

        state["fallos"] += 1
        state["ultimo_fallo_tiempo"] = time.time()

    except Exception as e:

        print(f"[ERROR] Servicio {name}: {str(e)}", flush=True)

        state["fallos"] += 1
        state["ultimo_fallo_tiempo"] = time.time()

    finally:

        fin = time.time()

        print(
            f"[INFO] Tiempo de respuesta {name}: {fin - inicio}s",
            flush=True
        )

    if state["fallos"] >= 3:

        state["abierto"] = True

        print(
            f"[CIRCUIT BREAKER] Circuito de {name} ABIERTO",
            flush=True
        )

    return {
        "error": f"Servicio {name} no disponible"
    }, 503


@app.route("/health/inventario")
def health_inventario():
    try:
        print(f"[HEALTH_ INVENTARIO] Respuesta healt [Ok]",flush=True);
        response = requests.get("http://inventario:5000/health", timeout=2)
        #return jsonify(response.json);
        return response.json()
    except:
        print(f"[HEALTH_ INVENTARIO] Respuesta healt [Error]",flush=True);
        return jsonify({"status" : "down"}, 503);

@app.route("/health/pagos")
def health_pagos():
    try:
        print(f"[HEALTH_ PAGOS] Respuesta healt [Ok]",flush=True);
        response = requests.get("http://pagos:5000/health", timeout=2)
        #return jsonify(response.json);
        return response.json()
    except:
        print(f"[HEALTH_ PAGOS] Respuesta healt [Error]",flush=True);
        return jsonify({"status" : "down"}, 503);

@app.route("/health/pedidos")
def health_pedidos():
    try:
        print(f"[HEALTH_ PEDIDOS] Respuesta healt [Ok]",flush=True);
        response = requests.get("http://pedidos:5000/health", timeout=2)
        #return jsonify(response.json);
        return response.json()
    except:
        print(f"[HEALTH_ PEDIDOS] Respuesta healt [Error]",flush=True);
        return jsonify({"status" : "down"}, 503);



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)