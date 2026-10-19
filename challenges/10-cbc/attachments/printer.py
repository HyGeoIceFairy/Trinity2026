import json,secrets
from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes
from cryptography.hazmat.primitives.padding import PKCS7
KEY=secrets.token_bytes(16)
def seal(receipt):
    pad=PKCS7(128).padder()
    raw=pad.update(json.dumps(receipt,separators=(",",":")).encode())+pad.finalize()
    encryptor=Cipher(algorithms.AES(KEY),modes.CBC(KEY)).encryptor()
    return encryptor.update(raw)+encryptor.finalize()
def inspect(ciphertext):
    decryptor=Cipher(algorithms.AES(KEY),modes.CBC(KEY)).decryptor()
    raw=decryptor.update(ciphertext)+decryptor.finalize()
    try:
        unpad=PKCS7(128).unpadder()
        data=unpad.update(raw)+unpad.finalize()
        return {"ok":True,"receipt":json.loads(data)}
    except (ValueError,UnicodeDecodeError):
        return {"ok":False,"debug_plaintext":raw.hex()}

