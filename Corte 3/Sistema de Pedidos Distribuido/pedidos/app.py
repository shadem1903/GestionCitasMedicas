from flask import Flask, request, jsonify
import requests
import json
import os
import time

app = Flask(__name__)

DB_FILE = "datos/pedidos.json"

def leer():
    if not os.path.exists(DB_FILE):
        os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
        guardar([])
    with open(DB_FILE, "r") as f:
        return json.load(f)

def guardar(datos):
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    with open(DB_FILE, "w") as f:
        json.dump(datos, f, indent=2)

@app.route("/")
def index():
    return {"servicio": "pedidos", "endpoints": ["/health", "/pedidos"]}

@app.route("/health")
def health():
    try:
        pedidos = leer()
        return {"status": "ok", "service": "pedidos", "almacenamiento": "ok", "total_pedidos": len(pedidos)}
    except:
        return {"status": "error", "service": "pedidos", "almacenamiento": "error"}, 500

@app.route("/pedidos")
def listar_pedidos():
    inicio = time.time()
    pedidos = leer()
    print(f"[PEDIDOS] GET /pedidos total={len(pedidos)} - tiempo: {time.time() - inicio:.4f}s", flush=True)
    return jsonify(pedidos)

@app.route("/pedidos", methods=["POST"])
def crear_pedido():
    inicio = time.time()
    data = request.get_json()
    producto_id = data.get("producto_id")
    cantidad = data.get("cantidad", 1)

    print(f"[PEDIDOS] nuevo pedido producto_id={producto_id} cantidad={cantidad}", flush=True)

    try:
        resp_inv = requests.post(
            "http://inventario:5000/verificar",
            json={"producto_id": producto_id, "cantidad": cantidad},
            timeout=2
        )
        inv = resp_inv.json()
    except:
        print("[PEDIDOS] ERROR: inventario no disponible", flush=True)
        return {"error": "inventario no disponible"}, 503

    if not inv.get("disponible"):
        print(f"[PEDIDOS] stock insuficiente para producto_id={producto_id}", flush=True)
        return {"error": "stock insuficiente", "detalle": inv}, 400

    total = float(inv["producto"]["precio"]) * cantidad

    try:
        resp_pago = requests.post(
            "http://pagos:5000/procesar",
            json={"monto": total, "pedido_id": "temporal"},
            timeout=3
        )
        pago = resp_pago.json()
    except:
        print("[PEDIDOS] ERROR: servicio de pagos caido - sin respuesta", flush=True)
        return {"error": "servicio de pagos no disponible"}, 503

    if not pago.get("aprobado"):
        print(f"[PEDIDOS] pago rechazado producto_id={producto_id} total={total}", flush=True)
        return {"error": "pago rechazado", "detalle": pago}, 402

    pedidos = leer()
    nuevo_id = len(pedidos) + 1
    pedido = {
        "id": nuevo_id,
        "producto_id": producto_id,
        "cantidad": cantidad,
        "total": total,
        "estado": "pagado",
        "transaccion_id": pago.get("transaccion_id"),
        "creado_en": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    pedidos.append(pedido)
    guardar(pedidos)

    requests.put(
        "http://inventario:5000/actualizar",
        json={"producto_id": producto_id, "cantidad": cantidad},
        timeout=2
    )

    print(f"[PEDIDOS] pedido creado id={nuevo_id} total={total} - tiempo: {time.time() - inicio:.4f}s", flush=True)
    return jsonify(pedido), 201

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
