import secrets
def transmit(first, second):
    stream=secrets.token_bytes(max(len(first),len(second)))
    def enc(message):
        return bytes(a^b for a,b in zip(message,stream))
    return enc(first),enc(second)

