from flask import Flask, jsonify
import requests
import time

app = Flask(__name__)

TIEMPO_ESPERA = 20  # segundos antes de intentar half-open

# Circuit Breaker - servicio backend
fallos_backend = 0
circuito_backend = False
tiempo_apertura_backend = None

# Circuit Breaker - servicio usuarios
fallos_usuarios = 0
circuito_usuarios = False
tiempo_apertura_usuarios = None

def circuito_permite_paso(circuito_abierto, tiempo_apertura):
    if not circuito_abierto:
        return True, False
    if time.time() - tiempo_apertura >= TIEMPO_ESPERA:
        print("Circuito en half-open, enviando petición de prueba...", flush=True)
        return True, True  # permite paso pero es prueba
    return False, False

@app.route("/usuarios")
def get_usuarios():
    global fallos_usuarios, circuito_usuarios, tiempo_apertura_usuarios
    permite, es_prueba = circuito_permite_paso(circuito_usuarios, tiempo_apertura_usuarios)
    if not permite:
        return {"error": "Servicio de usuarios temporalmente bloqueado"}, 503
    try:
        response = requests.get("http://usuarios:5000/usuarios", timeout=2)
        fallos_usuarios = 0
        circuito_usuarios = False
        if es_prueba:
            print("Half-open exitoso, circuito de usuarios cerrado", flush=True)
        return jsonify(response.json())
    except:
        fallos_usuarios += 1
        print(f"Fallo número {fallos_usuarios} conectando con usuarios", flush=True)
        if es_prueba:
            print("Fallo en prueba, circuito de usuarios se mantiene abierto", flush=True)
            tiempo_apertura_usuarios = time.time()
        if fallos_usuarios >= 3:
            circuito_usuarios = True
            tiempo_apertura_usuarios = time.time()
            print("Circuito de usuarios abierto", flush=True)
        return {"error": "Servicio de usuarios no disponible"}, 503

@app.route("/mascotas")
def get_mascotas():
    global fallos_backend, circuito_backend, tiempo_apertura_backend
    permite, es_prueba = circuito_permite_paso(circuito_backend, tiempo_apertura_backend)
    if not permite:
        return {"error": "Servicio temporalmente bloqueado"}, 503
    try:
        response = requests.get("http://backend:5000/mascotas", timeout=2)
        fallos_backend = 0
        circuito_backend = False
        if es_prueba:
            print("Half-open exitoso, circuito de backend cerrado", flush=True)
        return response.json()
    except:
        fallos_backend += 1
        print(f"Fallo número {fallos_backend}", flush=True)
        if es_prueba:
            print("Fallo en prueba, circuito de backend se mantiene abierto", flush=True)
            tiempo_apertura_backend = time.time()
        if fallos_backend >= 3:
            circuito_backend = True
            tiempo_apertura_backend = time.time()
            print("Circuito abierto", flush=True)
        return {"error": "Servicio no disponible"}, 503

@app.route("/mascotas/<int:id>")
def get_mascota_por_id(id):
    global fallos_backend, circuito_backend, tiempo_apertura_backend
    permite, es_prueba = circuito_permite_paso(circuito_backend, tiempo_apertura_backend)
    if not permite:
        return {"error": "Servicio temporalmente bloqueado"}, 503
    try:
        response = requests.get(f"http://backend:5000/mascotas/{id}", timeout=2)
        fallos_backend = 0
        circuito_backend = False
        if es_prueba:
            print("Half-open exitoso, circuito de backend cerrado", flush=True)
        return response.json()
    except:
        fallos_backend += 1
        print(f"Fallo número {fallos_backend} buscando mascota {id}", flush=True)
        if es_prueba:
            print("Fallo en prueba, circuito de backend se mantiene abierto", flush=True)
            tiempo_apertura_backend = time.time()
        if fallos_backend >= 3:
            circuito_backend = True
            tiempo_apertura_backend = time.time()
            print("Circuito abierto", flush=True)
        return {"error": "Servicio no disponible"}, 503

@app.route("/usuarios/<int:id>/mascotas")
def get_mascotas_por_usuario(id):
    global fallos_usuarios, circuito_usuarios, tiempo_apertura_usuarios
    permite, es_prueba = circuito_permite_paso(circuito_usuarios, tiempo_apertura_usuarios)
    if not permite:
        return {"error": "Servicio de usuarios temporalmente bloqueado"}, 503
    try:
        response = requests.get(f"http://usuarios:5000/usuarios/{id}/mascotas", timeout=2)
        fallos_usuarios = 0
        circuito_usuarios = False
        if es_prueba:
            print("Half-open exitoso, circuito de usuarios cerrado", flush=True)
        return jsonify(response.json())
    except:
        fallos_usuarios += 1
        print(f"Fallo número {fallos_usuarios} obteniendo mascotas del usuario {id}", flush=True)
        if es_prueba:
            print("Fallo en prueba, circuito de usuarios se mantiene abierto", flush=True)
            tiempo_apertura_usuarios = time.time()
        if fallos_usuarios >= 3:
            circuito_usuarios = True
            tiempo_apertura_usuarios = time.time()
            print("Circuito de usuarios abierto", flush=True)
        return {"error": "Servicio de usuarios no disponible"}, 503

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
