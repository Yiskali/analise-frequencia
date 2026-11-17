# Análise de Saldo de Frequência

Ferramenta em HTML para analisar o **Relatório de Frequência do MentorH** (PDF) e explicar ao empregado como o saldo do mês é formado — e por que ele **não é a soma da coluna Saldo Diário**.

## Como usar

1. Abra a página (GitHub Pages) no navegador.
2. Arraste o PDF do relatório (ou clique para escolher). Aceita vários arquivos e PDFs com mais de um empregado.
3. Confira a análise e use **Copiar resumo para o empregado** para colar no e-mail ou no SEI.

O PDF é lido no próprio navegador; nenhum dado é enviado.

## O que a análise mostra

- **Resumo do mês:** saldo oficial (CH executada − CH contratual), soma do Saldo Diário, saldo só dos dias trabalhados e efeito de afastamentos (ex.: férias).
- **Por que o saldo não é a soma do Saldo Diário:** ponte entre a soma do Saldo Diário e o saldo oficial (diferença entre escala e CH contratual, créditos de feriado e outros ajustes).
- **Trabalho efetivo × afastamentos:** separa o resultado do que foi trabalhado do crédito de escala nos afastamentos.
- **Análise semanal:** semanas de domingo a sábado, com classificação da escala (deficitária, adequada, superavitária) e observações.
- **Conferência com o relatório:** compara os totais recalculados com os impressos no PDF.

## Regras de cálculo

- CH contratual diária = CH semanal ÷ dias da jornada, lançada nos dias úteis da jornada; feriados não entram.
- CH escalada = carga da jornada em cada dia com código de jornada.
- CH considerada = coluna Horas Consideradas (HC); a soma é a CH executada.
- Saldo do mês = CH executada − CH contratual.

## Arquivos

- `index.html` — interface
- `parser.js` — leitura do relatório e cálculos
- `pdf.min.js`, `pdf.worker.min.js` — [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla, licença Apache 2.0)
