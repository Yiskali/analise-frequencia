# Análise de Saldo de Frequência

Ferramenta em HTML para analisar o **Relatório de Frequência do MentorH** (PDF) e explicar ao empregado como o saldo do mês é formado — e por que ele **não é a soma da coluna Saldo Diário**.

## Como usar

1. Abra a página (GitHub Pages) no navegador.
2. Arraste os PDFs do relatório ou clique em **Escolher arquivos**. Aceita vários arquivos e PDFs com mais de um empregado; todos aparecem na lista **Relatórios**, com saldo e pontos de atenção.
3. Abra um relatório e use as abas. **Resumo para o empregado** gera um texto para revisar e copiar para o e-mail ou o SEI.

O PDF é lido no próprio navegador; nenhum dado é enviado.

## Abas

- **Resumo:** saldo do mês (e o saldo estimado sem erros, quando houver), CH contratual, horas consideradas, a conta "Por que o saldo deu…" em linguagem simples e a tabela das semanas.
- **Semanas:** uma semana por vez (ou o mês inteiro), em tabela com as colunas de horas identificadas por cor (contratual em cinza, escalada em azul-marinho, consideradas em verde) e o saldo em azul (positivo) ou laranja (negativo). Calendário como visão opcional.
- **Pontos de atenção:** cada ponto com título simples e três partes: o que aconteceu, a demonstração nos registros (batidas, conta ou linha do tempo) e o que fazer, com o item do checklist e o caminho no Mentorh. Filtro por nível: Ajustar, Verificar e Informação.
- **Conferência:** totais recalculados × relatório e regras do cálculo.

## Pontos de atenção

Seguem o Checklist de Triagem e Tratamento do POP.DGP.127 (Anexo III):
- **Ajustar:** batida ímpar (A1); horas consideradas incompatíveis com os registros (B4/B5); falta não classificada; escala nas férias diferente da CH contratual (fora da 12x36 ou acima de 12h).
- **Verificar:** marcações com menos de 15 min (A4); dia escalado sem registro; registro fora da janela de 3h (B4); marcações sem código de jornada (B1); interjornada inferior a 11h (A2); CH escalada no mês diferente da contratual (B3); escala nas férias na 12x36 (até 12h); afastamento sem código de jornada (C2) ou com código incompatível (C3).
- **Informação:** quantidade elevada de marcações (A3); homologado com ressalva; falta injustificada.

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
