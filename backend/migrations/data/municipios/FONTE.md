# Catálogo nacional de municípios

`municipios.csv` é lido pela migração `0015_national_city_catalog.py` para preencher a tabela `cities`. A migração usa só este arquivo local e não acessa a rede.

## Origem

- Repositório: [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros), licença MIT. O aviso de copyright e a licença estão em [LICENSE](LICENSE), copiado sem alterações.
- Commit fixado: `503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861` (10 de dezembro de 2025, "Add cidade Boa Esperança do Norte. Issue#52").
- Arquivos usados, nesse commit:
  - `csv/municipios.csv` (SHA-256 `22bd03d004361329f69ddfa3f6c99cd53012aa53972a172e10b141288ad0b1fe`)
  - `csv/estados.csv` (SHA-256 `395c7b797b85592d71c686a0b537ba05349dee36c19b26a4b0d89494ff71448a`)
  - `LICENSE` (SHA-256 `c8254a78fe3edcb841e0df79bcd217e2626c2a13f9374dd8a51729d88dc0bc88`)

## Transformação

1. `codigo_uf` de `municipios.csv` é trocado pela sigla `uf` de `estados.csv`.
2. Ficam as colunas `codigo_ibge`, `nome`, `uf`, `latitude`, `longitude` e `capital` (`1` para capital de UF, `0` para as demais). Nome, coordenadas e indicador são copiados como publicados na origem.
3. As linhas são ordenadas por `codigo_ibge`. O arquivo é UTF-8 sem BOM, com fim de linha LF.

Resultado: 5.571 municípios com código IBGE de 7 dígitos, 27 capitais e SHA-256 `6cd3a273a3bea5d24090a596c58fb10034b7803cb22b14c65b2816dc2e68a402`. O commit fixado já inclui Boa Esperança do Norte (MT, 5101837), instalado em 2025; o commit anterior da origem tinha 5.570 municípios.

Latitude e longitude são as da sede do município. Este arquivo pertence à migração 0015 e não deve mudar depois de aplicado. Para atualizar o catálogo, repita a transformação a partir de um novo commit fixado, num arquivo novo lido por uma migração nova, e registre a origem ao lado dele.
