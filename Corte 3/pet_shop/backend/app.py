from flask import Flask, request, jsonify
import mysql.connector
import os
import time
import requests

app = Flask(__name__)

def get_connection():
    last_error = None
    for _ in range(10):
        try:
            return mysql.connector.connect(
              host = os.getenv("DB_HOST"),
              user = os.getenv("DB_USER"),
              password = os.getenv("DB_PASSWORD"),
              database = os.getenv("DB_NAME"),
              connection_timeout = 5
            )
        except mysql.connector.Error as error:
            last_error = error
            time.sleep(2)
    raise last_error

def ensure_tables():
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS mascotas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                tipo VARCHAR(255) NOT NULL,
                usuario_id INT
            )
            """
        )
        cursor.execute("SHOW COLUMNS FROM mascotas LIKE 'usuario_id'")
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE mascotas ADD COLUMN usuario_id INT")
        cursor.execute("SELECT COUNT(*) FROM mascotas")
        if cursor.fetchone()[0] == 0:
            cursor.executemany(
                "INSERT INTO mascotas (nombre, tipo, usuario_id) VALUES (%s, %s, %s)",
                [
                    ("Rex", "perro", 1),
                    ("Mishi", "gato", 2),
                    ("Piolín", "pájaro", 1),
                ]
            )
        connection.commit()
    finally:
        cursor.close()
        connection.close()

@app.route("/relacion")
def relacion():
    ensure_tables()
    connection = get_connection()
    cursor = connection.cursor(dictionary = True)
    cursor.execute("SELECT * FROM mascotas")
    mascotas = cursor.fetchall()
    cursor.close()
    connection.close()
    resultado = []
    for mascota in mascotas:
        usuario_id = mascota.get("usuario_id")
        usuario = None
        if usuario_id:
            for i in range(3):
                try:
                    print(f"[BACKEND], Llamando a usuarios para id {usuario_id}...", flush = True)
                    resp = requests.get(f"http://usuarios:5000/usuarios/{usuario_id}", timeout = 2)
                    if resp.status_code != 200:
                        usuario = {"error": "No encontrado"}
                    else:
                        usuario = resp.json()
                    print(f"[BACKEND], respuesta obtenida desde usuarios", flush = True)
                    break
                except requests.exceptions.Timeout:
                    usuario = {"error": "Tiempo de espera agotado"}
                    break
                except requests.exceptions.ConnectionError:
                    print(f"[BACKEND], timeout No de intentos: {i+1}", flush = True)
            else:
                usuario = {"error": "Servicio no disponible"}
        resultado.append({
            "mascota": mascota,
            "usuario": usuario
        })
    return jsonify(resultado)

@app.route("/")
def home():
    return "API FUNCIONANDO"

@app.route("/mascotas", methods = ["POST"])
def crear_mascota():
    print("[BACKEND], POST /mascotas", flush = True)
    ensure_tables()
    data = request.json
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        "INSERT INTO mascotas (nombre, tipo, usuario_id) VALUES (%s, %s, %s)",
        (data["nombre"], data["tipo"], data.get("usuario_id"))
    )
    connection.commit()
    cursor.close()
    connection.close()
    print(f"[BACKEND], mascota creada: {data['nombre']}", flush = True)
    return {"mensaje": "Mascota creada"}

@app.route("/mascotas/<int:id>", methods = ["GET"])
def obtener_mascota(id):
    print(f"[BACKEND], GET /mascotas/{id}", flush = True)
    ensure_tables()
    connection = get_connection()
    cursor = connection.cursor(dictionary = True)
    cursor.execute("SELECT * FROM mascotas WHERE id = %s", (id,))
    mascota = cursor.fetchone()
    cursor.close()
    connection.close()
    if mascota is None:
        print(f"[BACKEND], mascota {id} no encontrada", flush = True)
        return jsonify({"error": "Mascota no encontrada"}), 404
    print(f"[BACKEND], mascota {id} obtenida correctamente", flush = True)
    return jsonify(mascota)

@app.route("/mascotas", methods = ["GET"])
def obtener_mascotas():
    print("[BACKEND], GET /mascotas", flush = True)
    ensure_tables()
    connection = get_connection()
    cursor = connection.cursor(dictionary = True)
    usuario_id = request.args.get("usuario_id")
    if usuario_id:
        cursor.execute("SELECT * FROM mascotas WHERE usuario_id = %s", (usuario_id,))
    else:
        cursor.execute("SELECT * FROM mascotas")
    mascotas = cursor.fetchall()
    cursor.close()
    connection.close()
    print(f"[BACKEND], mascotas obtenidas: {len(mascotas)}", flush = True)
    return jsonify(mascotas)

if __name__ == "__main__":
    app.run(host = "0.0.0.0", port = 5000, debug = True)
