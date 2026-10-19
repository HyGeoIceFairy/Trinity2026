def envelope(message, modulus, exponent):
    number=int.from_bytes(message,"big")
    assert number<modulus
    return pow(number,exponent,modulus)
# The same message was packed twice, with e1=65537 and e2=17.

