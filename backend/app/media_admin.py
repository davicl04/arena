import argparse

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services.media import ensure_bucket, reconcile_orphans

parser = argparse.ArgumentParser(description='Administração do armazenamento privado de mídia.')
parser.add_argument('action', choices=['ensure-bucket', 'reconcile'])
args = parser.parse_args()

if args.action == 'ensure-bucket':
    ensure_bucket()
    print(f"Bucket privado '{get_settings().media_s3_bucket}' pronto.")
else:
    with SessionLocal() as session:
        print(f'{reconcile_orphans(session)} objeto(s) órfão(s) removido(s).')
