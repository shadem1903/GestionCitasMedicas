from flask import Flask, jsonify
import requests
import time

app = Flask(__name__)

# Configuración para el servicio de Mascotas
fallos_mascotas = 0
circuito_abierto_mascotas = False
tiempo_bloqueo_mascotas = 5
ultimo_fallo_mascotas = 0
URL_MASCOTAS = "http://backend:5000/mascotas"

# Configuración para el servicio de Usuarios
fallos_usuarios = 0
circuito_abierto_usuarios = False
tiempo_bloqueo_usuarios = 5
ultimo_fallo_usuarios = 0
URL_USUARIOS = "http://usuarios:5000/usuarios"

@app.route("/mascotas")
def mascotas():

    global fallos_mascotas, circuito_abierto_mascotas, ultimo_fallo_mascotas

    # Circuit Breaker abierto
    if circuito_abierto_mascotas:

        tiempo_actual = time.time()

        #Espera controlada
        if tiempo_actual - ultimo_fallo_mascotas > tiempo_bloqueo_mascotas:
            print("Estado Half-Open: Intentando reconexión...", flush=True)

            try:

                #Nuevo intanto para la reconexion
                response = requests.get(URL_MASCOTAS, timeout=4)

                 # Si funciona → cerrar circuito
                circuito_abierto_mascotas = False
                fallos_mascotas = 0

                print("Servicio recuperado, circuito cerrado", flush=True)

                return response.json()
            
            except Exception as e:
                print(e, flush=True)

                # Si vuelve a fallar → abrir otra vez
                ultimo_fallo_mascotas = time.time()

                print("El servicio sigue fallando. Circuito abierto nuevamente", flush=True)

                return {"error": "Servicio temporalmente bloqueado"}, 503
        else:
            print("El circuito esta abierto", flush=True)

            return {"error": "Servicio temporalmente bloqueado"}, 503
    
    try:
        response = requests.get(URL_MASCOTAS, timeout=4)
        fallos_mascotas = 0
        return response.json()
    
    except Exception as e:
        print(e, flush=True)

        fallos_mascotas += 1
        print(f"Fallo número {fallos_mascotas}", flush=True)

        # Abrir circuito
        if fallos_mascotas >= 3:
            circuito_abierto_mascotas = True
            ultimo_fallo_mascotas = time.time()
            print("Circuito abierto", flush=True)

        return {"error": "Servicio no disponible"}, 503


@app.route("/usuarios")
def usuarios():

    global fallos_usuarios, circuito_abierto_usuarios, ultimo_fallo_usuarios

    # Circuit Breaker abierto
    if circuito_abierto_usuarios:

        tiempo_actual = time.time()

        # Espera controlada
        if tiempo_actual - ultimo_fallo_usuarios > tiempo_bloqueo_usuarios:

            print("Estado Half-Open: Intentando reconexión a usuarios...", flush=True)

            try:
                # nuevo intento
                response = requests.get(URL_USUARIOS, timeout=2)

                # SI FUNCIONA → cerrar circuito
                circuito_abierto_usuarios = False
                fallos_usuarios = 0

                print("Servicio recuperado, circuito cerrado", flush=True)

                return jsonify(response.json())

            except Exception as e:

                print(e, flush=True)
                # SI FALLA → volver a abrir circuito
                ultimo_fallo_usuarios = time.time()
                print("Sigue fallando, circuito abierto nuevamente", flush=True)
                return {"error": "Servicio de usuarios temporalmente bloqueado"}, 503

        else:
            print("El circuito está abierto", flush=True)
            return {"error": "Servicio de usuarios temporalmente bloqueado"}, 503

    try:
        response = requests.get(URL_USUARIOS, timeout=2)
        fallos_usuarios = 0
        return jsonify(response.json())

    except:

        fallos_usuarios += 1
        print(f"Fallo número {fallos_usuarios} en Usuarios", flush=True)

        # Abrir circuito después de 3 fallos
        if fallos_usuarios >= 3:
            circuito_abierto_usuarios = True
            ultimo_fallo_usuarios = time.time()
            print("Circuito de usuarios abierto", flush=True)

        return {"error": "Servicio de usuarios no disponible"}, 503


# resumne
# resumen
@app.route("/resumen")
def resumen():

    resultado = {}
    errores = {}

    # 🔹 Usuarios
    if not circuito_abierto_usuarios:
        try:
            usuarios_data = requests.get(URL_USUARIOS, timeout=2).json()
            resultado["usuarios"] = usuarios_data
        except:
            errores["usuarios"] = "No disponible"
    else:
        errores["usuarios"] = "Bloqueado"

    # 🔹 Mascotas
    if not circuito_abierto_mascotas:
        try:
            mascotas_data = requests.get(URL_MASCOTAS, timeout=4).json()
            resultado["mascotas"] = mascotas_data.get("mascotas", [])
        except:
            errores["mascotas"] = "No disponible"
    else:
        errores["mascotas"] = "Bloqueado"

    # 🔹 Respuesta final
    if errores:
        return jsonify({
            "data": resultado,
            "errores": errores
        }), 206  # Partial Content

    return jsonify(resultado), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)