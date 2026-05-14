from flask import Flask, request, jsonify
import mysql.connector
import os
import time
import requests

app = Flask(__name__)

def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME")
    )

@app.route("/relacion")
def relacion():
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT nombre FROM mascotas LIMIT 1")
        mascota = cursor.fetchone()
        connection.close()
    except:
        mascota = None

    usuario = None
    for i in range(3):
        try:
            response = requests.get("http://usuarios:5000/usuarios", timeout=2)
            if response.status_code == 200:
                usuarios = response.json()
                usuario = usuarios[0]["nombre"] if usuarios else None
                break
        except:
            print(f"Intento {i+1} fallido usuarios")

    return jsonify({
        "usuario": usuario if usuario else "Sin usuario",
        "mascota": mascota[0] if mascota else "Sin mascota"
    })

@app.route("/")
def home():
    return "API FUNCIONANDO"

@app.route("/mascotas", methods=["POST"])
def crear_mascota():
    data = request.json
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "INSERT INTO mascotas (nombre, tipo) VALUES (%s, %s)",
        (data["nombre"], data["tipo"])
    )

    connection.commit()
    connection.close()

    return {"mensaje": "Mascota creada"}

@app.route("/mascotas", methods=["GET"])
def obtener_mascotas():
    time.sleep(3)  # simular lentitud
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM mascotas")
    mascotas = cursor.fetchall()
    connection.close()

    return jsonify({"mascotas": mascotas})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)