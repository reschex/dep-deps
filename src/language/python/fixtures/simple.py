def top_level():
    pass

class MyClass:
    def method(self):
        pass

    async def async_method(self):
        pass

def outer():
    def inner():
        pass
    return inner
