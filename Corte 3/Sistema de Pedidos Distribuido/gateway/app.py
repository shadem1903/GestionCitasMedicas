from flask import Flask, request, jsonify
import requests
import time

app = Flask(__name__)

fallos_pagos = 0
circuito_abierto = False

errores  = {"pedidos": 0, "inventario": 0, "pagos": 0}
exitosos = {"pedidos": 0, "inventario": 0, "pagos": 0}

@app.route("/")
def index():
    return {"servicio": "gateway", "endpoints": ["/health", "/monitoreo", "/inventario", "/pedidos", "/estado/<servicio>", "/circuit-breaker/reset"]}

@app.route("/health")
def health():
    return {"status": "ok", "service": "gateway"}

@app.route("/estado/<servicio>")
def estado_servicio(servicio):
    urls = {
        "pedidos":    "http://pedidos:5000/health",
        "inventario": "http://inventario:5000/health",
        "pagos":      "http://pagos:5000/health",
    }
    if servicio not in urls:
        return {"error": "servicio desconocido"}, 404
    print(f"[GATEWAY] consultando health de {servicio}", flush=True)
    try:
        resp = requests.get(urls[servicio], timeout=2)
        print(f"[GATEWAY] {servicio} responde OK", flush=True)
        return resp.json()
    except:
        print(f"[GATEWAY] {servicio} no responde - caido", flush=True)
        return {"status": "caido", "service": servicio}, 503

@app.route("/monitoreo")
def monitoreo():
    inicio = time.time()
    print("[GATEWAY] iniciando monitoreo de servicios", flush=True)

    def check(nombre, url):
        t = time.time()
        print(f"[GATEWAY] llamando a {nombre}...", flush=True)
        try:
            data = requests.get(url, timeout=2).json()
            ms = round((time.time() - t) * 1000, 1)
            data["latencia_ms"] = ms
            print(f"[GATEWAY] {nombre} responde OK - {ms}ms", flush=True)
            return data
        except:
            errores[nombre] += 1
            print(f"[GATEWAY] {nombre} no responde - caido - errores acumulados: {errores[nombre]}", flush=True)
            return {"status": "caido", "latencia_ms": None}

    resultado = {
        "servicios": {
            "pedidos":    {"health": check("pedidos",    "http://pedidos:5000/health"),    "exitosos": exitosos["pedidos"],    "errores": errores["pedidos"]},
            "inventario": {"health": check("inventario", "http://inventario:5000/health"), "exitosos": exitosos["inventario"], "errores": errores["inventario"]},
            "pagos":      {"health": check("pagos",      "http://pagos:5000/health"),      "exitosos": exitosos["pagos"],      "errores": errores["pagos"]},
        },
        "circuit_breaker_pagos": "ABIERTO" if circuito_abierto else "CERRADO",
    }

    print(f"[GATEWAY] monitoreo completado - tiempo: {time.time() - inicio:.4f}s", flush=True)
    return resultado

@app.route("/inventario")
def listar_inventario():
    inicio = time.time()
    print("[GATEWAY] llamando a inventario...", flush=True)
    try:
        resp = requests.get("http://inventario:5000/productos", timeout=2)
        exitosos["inventario"] += 1
        print(f"[GATEWAY] inventario responde OK - tiempo: {time.time() - inicio:.4f}s", flush=True)
        return resp.json(), resp.status_code
    except:
        errores["inventario"] += 1
        print("[GATEWAY] ERROR: inventario no responde - caido", flush=True)
        return {"error": "inventario no disponible"}, 503

@app.route("/pedidos")
def listar_pedidos():
    inicio = time.time()
    print("[GATEWAY] llamando a pedidos...", flush=True)
    try:
        resp = requests.get("http://pedidos:5000/pedidos", timeout=2)
        exitosos["pedidos"] += 1
        print(f"[GATEWAY] pedidos responde OK - tiempo: {time.time() - inicio:.4f}s", flush=True)
        return resp.json(), resp.status_code
    except:
        errores["pedidos"] += 1
        print("[GATEWAY] ERROR: pedidos no responde - caido", flush=True)
        return {"error": "pedidos no disponible"}, 503

@app.route("/pedidos", methods=["POST"])
def crear_pedido():
    global fallos_pagos, circuito_abierto
    inicio = time.time()

    if circuito_abierto:
        print("[GATEWAY] circuito ABIERTO - pedido rechazado sin llamar a pagos", flush=True)
        return {"error": "servicio de pagos no disponible"}, 503

    print("[GATEWAY] enviando pedido al servicio pedidos...", flush=True)
    try:
        resp = requests.post("http://pedidos:5000/pedidos", json=request.get_json(), timeout=5)
        data = resp.json()

        if resp.status_code in (402, 503):
            fallos_pagos += 1
            errores["pagos"] += 1
            print(f"[GATEWAY] fallo en pagos #{fallos_pagos} - tiempo: {time.time() - inicio:.4f}s", flush=True)
            if fallos_pagos >= 3:
                circuito_abierto = True
                print("[GATEWAY] circuit breaker ABIERTO - demasiados fallos en pagos", flush=True)
        else:
            fallos_pagos = 0
            exitosos["pagos"] += 1
            exitosos["pedidos"] += 1
            print(f"[GATEWAY] pedido creado OK - tiempo: {time.time() - inicio:.4f}s", flush=True)

        return data, resp.status_code
    except:
        errores["pedidos"] += 1
        print("[GATEWAY] ERROR: pedidos no responde - caido", flush=True)
        return {"error": "pedidos no disponible"}, 503

@app.route("/circuit-breaker/reset", methods=["POST"])
def reset_circuit_breaker():
    global fallos_pagos, circuito_abierto
    fallos_pagos = 0
    circuito_abierto = False
    print("[GATEWAY] circuit breaker reiniciado", flush=True)
    return {"mensaje": "circuit breaker reiniciado"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
