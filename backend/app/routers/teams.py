"""Times, elenco, convites, link do time e pedidos de entrada (Times e campeonatos, fases 1 e 2).

Rotas a implementar pela frente A conforme docs/decisoes/0003-times-campeonatos.md. O router já está
registrado em app/main.py para que as frentes paralelas não editem o mesmo arquivo.
"""
from fastapi import APIRouter

router = APIRouter(prefix='/api/v1')
