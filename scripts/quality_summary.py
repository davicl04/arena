"""Render test and coverage artifacts as a GitHub Actions Markdown summary."""
import argparse
import json
from pathlib import Path
from xml.etree import ElementTree


def test_result(path):
    root = ElementTree.parse(path).getroot()
    suites = [root] if root.tag == 'testsuite' else root.findall('testsuite')
    totals = {key: sum(int(s.get(key, '0')) for s in suites)
              for key in ('tests', 'failures', 'errors', 'skipped')}
    executed = totals['tests'] - totals['skipped']
    passed = executed - totals['failures'] - totals['errors']
    rate = f'{passed / executed:.2%}' if executed else 'não calculada'
    return f'{passed}/{executed} ({rate}); {totals["skipped"]} pulados'


def summary(area, directory):
    if area == 'backend':
        rows = []
        for name, label in [('unit', 'Backend: unidade'), ('full', 'Backend: unidade + integração')]:
            if not (directory / f'{name}.xml').exists() or not (directory / f'{name}-tests.xml').exists():
                continue
            coverage = ElementTree.parse(directory / f'{name}.xml').getroot()
            percent = float(coverage.attrib['line-rate']) * 100
            branches = float(coverage.attrib['branch-rate']) * 100
            rows.append((label, test_result(directory / f'{name}-tests.xml'), percent, branches))
    else:
        if not (directory / 'coverage-summary.json').exists() or not (directory / 'tests.xml').exists():
            return f'Relatórios de {area} indisponíveis; confira os logs do job.\n'
        total = json.loads((directory / 'coverage-summary.json').read_text(encoding='utf-8'))['total']
        rows = [(area, test_result(directory / 'tests.xml'), total['lines']['pct'], total['branches']['pct'])]
    if not rows:
        return f'Relatórios de {area} indisponíveis; confira os logs do job.\n'
    lines = ['| Escopo | Testes aprovados/executados (sucesso) | Cobertura de linhas | Cobertura de ramos |',
             '| --- | --- | --- | --- |']
    lines += [f'| {label} | {tests} | {percent:.2f}% | {branches:.2f}% |'
              for label, tests, percent, branches in rows]
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('area', choices=['backend', 'web', 'mobile'])
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    print(summary(args.area, args.directory))
