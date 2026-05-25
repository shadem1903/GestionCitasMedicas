from flask import Flask, jsonify
import requests

app = Flask(__name__)

USUARIOS = [
    {"id": 1, "nombre": "Ana"},
    {"id": 2, "nombre": "Luis"},
    {"id": 3, "nombre": "María"}
]

@app.route("/usuarios")
def usuarios():
    print("[USUARIOS], GET /usuarios", flush = True)
    return jsonify(USUARIOS)

@app.route("/usuarios/<int:id>")
def usuario_por_id(id):
    print(f"[USUARIOS], GET /usuarios/{id}", flush = True)
    usuario = next((u for u in USUARIOS if u["id"] == id), None)
    if usuario is None:
        print(f"[USUARIOS], usuario {id} no encontrado", flush = True)
        return jsonify({"error": "Usuario no encontrado"}), 404
    print(f"[USUARIOS], usuario {id} obtenido correctamente", flush = True)
    return jsonify(usuario)

@app.route("/usuarios/<int:id>/mascotas")
def mascotas_por_usuario(id):
    print(f"[USUARIOS], GET /usuarios/{id}/mascotas", flush = True)
    usuario = next((u for u in USUARIOS if u["id"] == id), None)
    if usuario is None:
        print(f"[USUARIOS], usuario {id} no encontrado", flush = True)
        return jsonify({"error": "Usuario no encontrado"}), 404
    for i in range(3):
        try:
            print(f"[USUARIOS], Llamando al backend para mascotas del usuario {id}...", flush = True)
            resp = requests.get(f"http://backend:5000/mascotas?usuario_id={id}", timeout = 2)
            if resp.status_code != 200:
                return jsonify({"error": "No se pudieron obtener las mascotas"}), 502
            print(f"[USUARIOS], respuesta obtenida desde backend", flush = True)
            return jsonify({"usuario": usuario, "mascotas": resp.json()})
        except requests.exceptions.Timeout:
            return jsonify({"error": "Tiempo de espera agotado"}), 503
        except requests.exceptions.ConnectionError:
            print(f"[USUARIOS], timeout No de intentos: {i+1}", flush = True)
    return jsonify({"error": "Servicio no responde"}), 504

if __name__ == "__main__":
    app.run(host = "0.0.0.0", port = 5000)
