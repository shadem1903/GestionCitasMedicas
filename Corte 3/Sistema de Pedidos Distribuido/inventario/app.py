from flask import Flask, request, jsonify
import json
import os
import time

app = Flask(__name__)

DB_FILE = "datos/productos.json"

PRODUCTOS_INICIALES = [
    {"id": 1, "nombre": "Laptop",      "stock": 10, "precio": 1200.00},
    {"id": 2, "nombre": "Mouse",       "stock": 50, "precio": 25.00},
    {"id": 3, "nombre": "Teclado",     "stock": 30, "precio": 75.00},
    {"id": 4, "nombre": "Monitor",     "stock": 8,  "precio": 350.00},
    {"id": 5, "nombre": "Auriculares", "stock": 20, "precio": 90.00},
]

def leer():
    if not os.path.exists(DB_FILE):
        os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
        guardar(PRODUCTOS_INICIALES)
        print("[INVENTARIO] archivo de productos inicializado", flush=True)
    with open(DB_FILE, "r") as f:
        return json.load(f)

def guardar(datos):
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    with open(DB_FILE, "w") as f:
        json.dump(datos, f, indent=2)

@app.route("/")
def index():
    return {"servicio": "inventario", "endpoints": ["/health", "/productos", "/verificar", "/actualizar"]}

@app.route("/health")
def health():
    try:
        leer()
        return {"status": "ok", "service": "inventario", "almacenamiento": "ok"}
    except:
        return {"status": "error", "service": "inventario", "almacenamiento": "error"}, 500

@app.route("/productos")
def listar_productos():
    inicio = time.time()
    productos = leer()
    print(f"[INVENTARIO] GET /productos total={len(productos)} - tiempo: {time.time() - inicio:.4f}s", flush=True)
    return jsonify(productos)

@app.route("/verificar", methods=["POST"])
def verificar_stock():
    inicio = time.time()
    data = request.get_json()
    producto_id = data.get("producto_id")
    cantidad = data.get("cantidad", 1)

    productos = leer()
    producto = next((p for p in productos if p["id"] == producto_id), None)

    if not producto:
        print(f"[INVENTARIO] producto no encontrado id={producto_id}", flush=True)
        return {"disponible": False, "motivo": "producto no encontrado"}, 404

    disponible = producto["stock"] >= cantidad
    print(f"[INVENTARIO] verificar id={producto_id} cantidad={cantidad} stock={producto['stock']} disponible={disponible} - tiempo: {time.time() - inicio:.4f}s", flush=True)
    return jsonify({"disponible": disponible, "stock_actual": producto["stock"], "producto": producto})

@app.route("/actualizar", methods=["PUT"])
def actualizar_stock():
    data = request.get_json()
    producto_id = data.get("producto_id")
    cantidad = data.get("cantidad", 1)

    productos = leer()
    producto = next((p for p in productos if p["id"] == producto_id), None)

    if not producto or producto["stock"] < cantidad:
        print(f"[INVENTARIO] ERROR stock insuficiente id={producto_id}", flush=True)
        return {"actualizado": False, "motivo": "stock insuficiente o producto no existe"}, 400

    producto["stock"] -= cantidad
    guardar(productos)
    print(f"[INVENTARIO] stock actualizado id={producto_id} nuevo_stock={producto['stock']}", flush=True)
    return {"actualizado": True}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
