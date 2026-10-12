"""Pedido de organizador, permissão e filas da administração (Times e campeonatos, fase 3).

Rotas a implementar pela frente B conforme docs/decisoes/0003-times-campeonatos.md. O router já está
registrado em app/main.py para que as frentes paralelas não editem o mesmo arquivo.
"""
from fastapi import APIRouter

router = APIRouter(prefix='/api/v1')
