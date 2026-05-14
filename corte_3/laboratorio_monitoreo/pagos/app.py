from flask import Flask, request, jsonify
app= Flask(__name__)

@app.route("/pagos")
def inventario():
    print("[PAGOS], Extrayendo información de pagos.",flush=True);
    return jsonify([
        {"pago_id":1, "id_pedido": 1,"cliente" : "Jose Luis",  "total": 50000},
        {"pago_id":2, "id_pedido": 2,"cliente" : "Lesly Lopez","total": 20000},
        {"pago_id":3, "id_pedido": 3,"cliente" : "Lesly Lopez","total": 100000}
    ])
@app.route("/health")
def health():
    return{
        "status" : "ok",
        "service" : "Pagos"
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)