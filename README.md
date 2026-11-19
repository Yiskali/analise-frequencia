# Análise de Saldo de Frequência

Ferramenta em HTML para analisar o **Relatório de Frequência do MentorH** (PDF) e explicar ao empregado como o saldo do mês é formado — e por que ele **não é a soma da coluna Saldo Diário**.

## Como usar

1. Abra a página (GitHub Pages) no navegador.
2. Arraste os PDFs do relatório (ou clique para escolher). Aceita vários arquivos e PDFs com mais de um empregado; cada arquivo aparece na lista com o andamento da leitura.
3. Confira a análise e use **Resumo para o empregado** para revisar o texto e copiar para o e-mail ou o SEI.

O PDF é lido no próprio navegador; nenhum dado é enviado.

## O que a análise mostra

- **Resumo:** saldo do mês (horas consideradas − CH contratual), separado entre dias trabalhados e afastamentos (ex.: férias).
- **Por que o saldo não é a soma do Saldo Diário:** gráfico em cascata da soma do Saldo Diário até o saldo do mês (diferença entre escala e CH contratual, créditos de feriado e outros ajustes).
- **Semanas:** domingo a sábado, com CH contratual, escalada e considerada, classificação da escala (deficitária, adequada, superavitária) e saldo da semana.
- **Dias do mês:** calendário ou tabela com registros, horas consideradas, saldo diário, feriados, afastamentos e acertos manuais.
- **Conferência:** compara os totais recalculados com os impressos no PDF.
- **Pontos de atenção:** segue o Checklist de Triagem e Tratamento do POP.DGP.127 (Anexo III), com a providência e a funcionalidade do Mentorh de cada item. Aponta:
  - batida ímpar (falta uma entrada ou saída) e o saldo do dia que ela distorce;
  - horas consideradas incompatíveis com os registros (com o saldo corrigido estimado);
  - registros em duplicidade, dia escalado sem registro e registro fora da jornada;
  - escala nas férias diferente da CH contratual do período (na 12x36, diferença admitida até 12h);
  - marcações consecutivas com menos de 15 min (A4) e quantidade elevada de marcações (A3);
  - interjornada inferior a 11h (A2) e registros fora da janela de 3h da jornada (B4);
  - marcações sem código de jornada (B1) e CH escalada no mês diferente da contratual (B3);
  - afastamento sem código de jornada (C2) ou com código incompatível (C3);
  - falta não classificada e falta injustificada;
  - dias homologados com ressalva.

## Regras de cálculo

- CH contratual diária = CH semanal ÷ dias da jornada, lançada nos dias úteis da jornada; feriados não entram.
- CH escalada = carga da jornada em cada dia com código de jornada.
- CH considerada = coluna Horas Consideradas (HC); a soma é a CH executada.
- Saldo do mês = CH executada − CH contratual.
- Extensão de jornada remunerada: o saldo do dia é desconsiderado e vai para pagamento.
- Plantão de sobreaviso e jornada extraordinária remunerada: todo o tempo trabalhado no dia vai para pagamento.
- Essas ocorrências não são tratadas como inconsistência.
- Horas consideradas recalculadas a partir dos registros: soma dos pares entrada/saída, com adicional noturno (22h às 5h) e desconto do intervalo pré-assinalado fora da jornada; tolerância de 10 minutos.

## Arquivos

- `index.html` — interface
- `parser.js` — leitura do relatório e cálculos
- `pdf.min.js`, `pdf.worker.min.js` — [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla, licença Apache 2.0)
