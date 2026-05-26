from flask import Flask, request, jsonify

app= Flask(__name__)

@app.route("/pedidos")
def pedidos():
    print("[PEDIDOS], Extrayendo información de pedidos.",flush=True);
    return jsonify([
      {"pedido_id": 1, "items": [{ "inventario_id": 1, "cantidad": 2 },{ "inventario_id": 2, "cantidad": 3 },{ "inventario_id": 3, "cantidad": 2 }]},
      {"pedido_id": 2, "items": [{ "inventario_id": 1, "cantidad": 1 },{ "inventario_id": 2, "cantidad": 1 },{ "inventario_id": 3, "cantidad": 1 }]},
      {"pedido_id": 3, "items": [{ "inventario_id": 1, "cantidad": 2 },{ "inventario_id": 2, "cantidad": 1 },{ "inventario_id": 3, "cantidad": 5 }]}
    ])

@app.route("/health")
def health():
    return{
        "status" : "ok",
        "service" : "Pedidos"
    }

if __name__ == "__main__":
    app.run(host="0.0.0.0", port= 5000, debug=True)