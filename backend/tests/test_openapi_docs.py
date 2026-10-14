from app.core.openapi import OPENAPI_TAGS
from app.main import app


def test_every_operation_has_a_declared_tag_and_a_summary():
    schema = app.openapi()
    declared = {tag['name'] for tag in OPENAPI_TAGS}
    undocumented = [
        f'{method.upper()} {path}'
        for path, methods in schema['paths'].items()
        for method, operation in methods.items()
        if len(operation.get('tags', [])) != 1 or operation['tags'][0] not in declared or not operation.get('summary')
    ]
    assert undocumented == []
    assert {tag for methods in schema['paths'].values() for op in methods.values() for tag in op['tags']} == declared
