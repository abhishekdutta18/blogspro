import os
import json
from flask import Blueprint, request, jsonify
from ..utils.logger import get_logger

kv_bp = Blueprint('kv', __name__)
logger = get_logger('mirofish.kv')

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data_cache')

os.makedirs(DATA_DIR, exist_ok=True)

@kv_bp.route('/<path:key>', methods=['GET'])
def get_kv(key):
    real_data_dir = os.path.realpath(DATA_DIR)
    file_path = os.path.normpath(os.path.join(DATA_DIR, key))
    real_file_path = os.path.realpath(file_path) if os.path.exists(file_path) else file_path
    
    if not os.path.realpath(real_file_path).startswith(real_data_dir):
        return jsonify({"error": "Access denied"}), 403
        
    if not os.path.exists(real_file_path):
        return jsonify({"error": "Key not found"}), 404
    try:
        with open(real_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data), 200
    except Exception as e:
        logger.error(f"Failed to read KV {key}: {e}")
        return jsonify({"error": str(e)}), 500

@kv_bp.route('/<path:key>', methods=['PUT'])
def put_kv(key):
    real_data_dir = os.path.realpath(DATA_DIR)
    file_path = os.path.normpath(os.path.join(DATA_DIR, key))
    
    # Ensure folder doesn't escape
    if not os.path.realpath(file_path).startswith(real_data_dir):
        return jsonify({"error": "Access denied"}), 403
        
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    try:
        req_data = request.get_json(force=True, silent=True)
        if req_data is None:
            # Fallback to text
            req_data = request.data.decode('utf-8')
            
        with open(file_path, 'w', encoding='utf-8') as f:
            if isinstance(req_data, (dict, list)):
                json.dump(req_data, f, ensure_ascii=False, indent=2)
            else:
                f.write(req_data)
                
        logger.info(f"Successfully updated cache key: {key}")
        return jsonify({"status": "success"}), 200
    except Exception as e:
        logger.error(f"Failed to write KV {key}: {e}")
        return jsonify({"error": str(e)}), 500

