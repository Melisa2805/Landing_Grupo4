module.exports = `def contar_caminos(matriz, origen, destino):
    n = len(matriz)
    memo = {}

    def dp(u):
        if u == destino:
            return 1

        if u in memo:
            return memo[u]

        total = 0

        for v in range(n):
            if matriz[u][v] == 1:
                total += dp(v)

        memo[u] = total
        return total

    return dp(origen)`
