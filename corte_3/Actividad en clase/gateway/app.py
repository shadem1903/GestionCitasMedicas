from flask import Flask, request, jsonify
import requests
import time

app = Flask(__name__)

fallos_backend = 0
circuito_abierto= False

@app.route("/usuarios")
def usuarios():
    data, status = safe_request("usuarios", "http://usuarios:5000/usuarios")
    return jsonify(data), status

@app.route("/mascotas")
def mascotas():
   global fallos_backend, circuito_abierto
   if circuito_abierto:
        return {"error": "Servicio temporalmente bloqueado"}, 503
   try: 
        inicio = time.time();
        print("[GATEWAY], Consultando el servicio de mascotas.", flush=True);
        response = requests.get("http://backend:5000/mascotas", timeout=2)
        fallos_backend = 0
        fin = time.time();
        print(f"[INFO], tiempo de respuesta: {fin-inicio} ", flush=True); 
        return response.json()
   except:
        fallos_backend += 1
        print(f"Fallo número {fallos_backend}", flush=True)

        if fallos_backend >= 3:
            circuito_abierto = True
            print("Circuito abierto", flush=True)

        return {"error": "Servicio no disponible"}, 503
   
#  Estados iniciales de los servicios
#circuit_states = {
 #   "usuarios": {"fallos": 0, "abierto": False},
 #   "mascotas": {"fallos": 0, "abierto": False}
#}

#def safe_request(name, url):
    # state = circuit_states[name]
    
    # if state["abierto"]:
    #     return {"error": f"Circuito abierto: el servicio de {name} bloqueado"}, 503

    # try:
    #     response = requests.get(url, timeout=2)
    #     state["fallos"] = 0 
    #     return response.json(), 200
    # except:
    #     state["fallos"] += 1
    #     print(f"[{name.upper()}] Fallo número {state['fallos']}", flush=True)

    #     if state["fallos"] >= 3:
    #         state["abierto"] = True
    #         print(f"Circuito de {name.upper()} abierto", flush=True)

    #     return {"error": f"Servicio {name} no disponible"}, 503

#  Estados iniciales de los servicios
circuit_states = {
    "usuarios": {"fallos": 0, "abierto": False, "ultimo_fallo_tiempo": 0},
    "mascotas": {"fallos": 0, "abierto": False, "ultimo_fallo_tiempo": 0}
}

TIEMPO_ESPERA = 20 # En segundos

def safe_request(name, url):
    state = circuit_states[name]
    ahora = time.time()
    
    print(f"Tiempo de espera configurado: {TIEMPO_ESPERA} segundos", flush=True)


    if state["abierto"]:
        # Valida tiempo de espera
        if ahora - state["ultimo_fallo_tiempo"] > TIEMPO_ESPERA:
            print(f"[{name.upper()}] Recuperando (Half-Open) ", flush=True)
        else:
            return {"error": f"Circuito abierto: el servicio de {name} bloqueado"}, 503

    try:
        response = requests.get(url, timeout=2)
        
        state["fallos"] = 0 
        state["abierto"] = False 
        return response.json(), 200
        
    except:
        state["fallos"] += 1
        state["ultimo_fallo_tiempo"] = ahora 
        print(f"[{name.upper()}] Fallo número {state['fallos']}", flush=True)

        if state["fallos"] >= 3:
            state["abierto"] = True
            print(f"Circuito de {name.upper()} abierto", flush=True)

        return {"error": f"Servicio {name} no disponible"}, 503
       


@app.route("/estado/backend")
def estado_backend():
    try:
        response = requests.get("http://backend:5000/health", timeout=2)
        #return jsonify(response.json);
        return response.json()
    except:
        return jsonify({"status" : "down"}, 503);

@app.route("/estado/usuarios")
def estado_usuarios():
    try:
        response = requests.get("http://usuarios:5000/health", timeout=2)
        #return jsonify(response.json);
        return response.json()
    except:
        return jsonify({"status" : "down"}, 503);


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)