# Controle de Van

Protótipo profissional local/PWA para cobradores, motoristas, donos de van e administradores de transporte alternativo.

## O que o app faz

- Conta passageiros de passagem inteira.
- Controla passageiros do trecho especial **Luso**.
- Registra pagamentos em dinheiro e Pix.
- Calcula valor esperado, recebido, falta receber ou sobra.
- Usa GPS do navegador quando disponível.
- Gera alerta grande de foto obrigatória nos pontos cadastrados.
- Tenta vibrar o celular no alerta de foto.
- Captura foto pela câmera traseira quando o navegador permitir.
- Marca fotos pendentes e fotos suspeitas.
- Gera relatório antes de salvar.
- Salva histórico de viagens.
- Exporta JSON.
- Exporta PDF usando `window.print()` / “Salvar como PDF”.
- Possui área administrativa com PIN.
- Cadastra pessoas/cobradores/motoristas.
- Cadastra vans.
- Configura valores de tarifa.
- Configura pontos de foto por mapa com alfinete.
- Configura ponto Luso por mapa com alfinete.
- Exibe painel visual das vans em viagem em mapa embutido.

## Estrutura

```text
controle-van/
├── index.html
├── style.css
├── app.js
├── manifest.json
├── sw.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

## Como abrir o app

Você pode abrir direto o arquivo:

```text
index.html
```

Alguns recursos podem ser limitados ao abrir por arquivo local, principalmente PWA, GPS, câmera e service worker.

## Como rodar localmente

Na pasta do projeto, rode:

```bash
python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

Esse modo é melhor para testar PWA, service worker, câmera e GPS.

## Como instalar no celular

1. Coloque o projeto em um servidor HTTPS ou rode localmente em ambiente compatível.
2. Abra o endereço no navegador do celular.
3. No Chrome/Android, toque em “Adicionar à tela inicial” ou “Instalar app”.
4. No iPhone, use Safari > Compartilhar > Adicionar à Tela de Início.

PWA normalmente exige HTTPS ou localhost.

## Área administrativa

A senha/PIN padrão é:

```text
1234
```

Na primeira versão, o PIN fica salvo em `localStorage`. Isso é simples e útil para protótipo, mas não é segurança real.

## Fluxo recomendado de uso

1. Entre na **Área do Administrador**.
2. Cadastre uma pessoa/cobrador/motorista.
3. Cadastre ou confirme a van vinculada.
4. Configure os valores das tarifas.
5. Cadastre os pontos obrigatórios de foto.
6. Configure o ponto Luso.
7. Volte para a tela inicial.
8. Inicie uma nova viagem.
9. Conte passageiros e pagamentos durante o trajeto.
10. Registre o Luso quando chegar ao ponto.
11. Tire fotos quando o alerta obrigatório aparecer.
12. Encerre a viagem.
13. Confira o relatório.
14. Clique em **Salvar viagem**.
15. Exporte JSON ou PDF se necessário.

## Como configurar pontos no mapa

Na área administrativa, abra **Pontos de Foto**.

Você pode:

- clicar no mapa para inserir o alfinete;
- arrastar o alfinete;
- usar “Usar minha localização atual”;
- preencher latitude e longitude manualmente;
- definir raio de tolerância;
- definir sentido: ida, volta ou ambos;
- marcar obrigatório ou opcional;
- definir ordem do trajeto;
- ativar ou inativar o ponto.

O mapa usa Leaflet + OpenStreetMap como padrão. O app não depende de chave paga para o protótipo funcionar.

## Como configurar o ponto Luso

Na área administrativa, abra **Ponto Luso**.

Você pode:

- escolher no mapa;
- usar sua localização atual;
- definir raio de tolerância;
- ativar ou inativar o ponto.

Quando o cobrador se aproxima do Luso durante a viagem, o app pode sugerir o registro da movimentação.

## Como usar o painel visual das vans

Na área administrativa, abra **Localização das Vans**.

O painel mostra:

- mapa embutido no próprio app;
- botão **Atualizar vans**;
- alfinetes das vans em viagem;
- cards com resumo de cada van.

Ao clicar em **Atualizar vans**, o app:

- lê as viagens em andamento salvas neste navegador/localStorage;
- pega a última localização GPS real quando existir;
- calcula localização estimada quando não houver GPS;
- reposiciona todos os alfinetes;
- atualiza os cards abaixo do mapa.

O painel **não abre Google Maps externo** como função principal.

## Localização real e estimada

A localização real vem do GPS do navegador.

Quando não houver GPS, a estimativa pode usar:

- sentido da viagem;
- horário de início;
- tempo decorrido;
- pontos cadastrados e ordem do trajeto;
- último alerta de foto;
- último evento do Luso;
- última foto com localização.

Níveis de confiança:

- **Alta**: GPS recente ou foto recente com localização.
- **Média**: último ponto, alerta ou Luso recente.
- **Baixa**: somente tempo de viagem e rota configurada.
- **Indisponível**: sem dados suficientes.

A estimativa é aproximada e não substitui rastreamento real.

## Como salvar viagem

O botão **Encerrar viagem** não salva imediatamente.

O app primeiro mostra o relatório/resumo. Depois aparecem os botões:

- **Salvar viagem**;
- **Exportar JSON**;
- **Exportar PDF**;
- **Voltar/continuar**.

A viagem só entra no histórico definitivo depois de clicar em **Salvar viagem**.

## Como exportar JSON

Na tela de relatório, clique em **Exportar JSON**.

O arquivo gerado contém:

- dados da viagem;
- responsável;
- van;
- sentido;
- passageiros;
- pagamentos;
- eventos Luso;
- fotos;
- pendências;
- logs;
- localização;
- configurações usadas na viagem.

Nome sugerido:

```text
controle-van-viagem-[data]-van-[numero].json
```

## Como exportar PDF

Na tela de relatório, clique em **Exportar PDF**.

O app abre a impressão do navegador. Escolha:

```text
Salvar como PDF
```

O CSS possui regras `@media print` para esconder botões e menus e deixar o relatório mais limpo.

## Limitações de segurança

Esta versão dificulta fraudes simples, mas não impede 100%:

- GPS falso;
- adulteração avançada do navegador;
- manipulação do `localStorage`;
- alteração dos arquivos locais;
- exclusão manual dos dados do navegador;
- envio de imagens adulteradas;
- uso de outro aparelho sem sincronização.

Para segurança profissional, seria necessário:

- servidor/backend;
- autenticação real;
- banco de dados remoto;
- logs imutáveis;
- trilha de auditoria;
- sincronização em nuvem;
- validação antifraude;
- armazenamento seguro de fotos;
- permissões por usuário.

## Limitações técnicas

- `localStorage` tem limite de espaço.
- Fotos em base64 podem ocupar muito espaço.
- Por isso, o app reduz a imagem antes de salvar a prévia.
- Para produção, use IndexedDB ou armazenamento em nuvem.
- GPS e câmera funcionam melhor em HTTPS ou localhost.
- Service worker não funciona abrindo direto via `file://`.
- O painel das vans só mostra dados disponíveis no armazenamento local atual.
- Para ver vans em celulares diferentes em tempo real, é necessário servidor ou banco em nuvem.
- Google Maps pode exigir chave de API e cobrança.
- Leaflet/OpenStreetMap é uma boa alternativa para protótipo.

## Testes realizados

### Passageiros

- Adicionar +1 passageiro.
- Adicionar +10 passageiros.
- Remover -1 passageiro.
- Remover -10 passageiros.
- Impedir contador negativo.
- Conferir cálculo do valor esperado.
- Conferir separação entre tarifa inteira e Luso.

### Pagamentos

- Adicionar pagamento dinheiro.
- Adicionar pagamento Pix.
- Remover pagamento dinheiro.
- Remover pagamento Pix.
- Impedir pagamento negativo.
- Conferir total recebido.
- Conferir diferença entre esperado e recebido.
- Conferir sobra quando recebido for maior que esperado.

### Luso

- Registrar passageiros Luso na ida.
- Converter passageiros inteiros em Luso na ida.
- Registrar passageiros Luso na volta.
- Conferir tarifa de R$ 2,50.
- Conferir soma no relatório.
- Conferir pagamentos do Luso em dinheiro.
- Conferir pagamentos do Luso em Pix.

### Fotos

- Cadastrar ponto obrigatório.
- Simular chegada ao ponto.
- Gerar alerta grande de foto.
- Vibrar celular quando permitido.
- Registrar foto.
- Marcar foto pendente.
- Marcar foto suspeita se fora do raio.
- Impedir apagar pendência sem admin.

### Administrador

- Bloquear acesso sem senha.
- Permitir acesso com senha 1234.
- Alterar senha.
- Cadastrar pessoa.
- Editar pessoa.
- Cadastrar van.
- Editar van.
- Cadastrar ponto.
- Editar ponto.
- Remover ponto.
- Alterar valores de passagem.
- Configurar ponto Luso.
- Usar mapa para inserir alfinete.
- Usar GPS atual como coordenada.

### Painel visual das vans

- Iniciar viagem com van cadastrada.
- Abrir painel das vans.
- Clicar em Atualizar vans.
- Exibir alfinete da van no mapa.
- Exibir várias vans no mapa.
- Mostrar popup com dados da van.
- Mostrar localização real quando houver GPS.
- Mostrar localização estimada quando não houver GPS.
- Atualizar todos os alfinetes ao clicar no botão.

### Histórico e relatório

- Encerrar viagem.
- Visualizar relatório antes de salvar.
- Clicar em Salvar viagem.
- Salvar no histórico.
- Abrir relatório salvo.
- Exportar JSON.
- Exportar PDF.
- Conferir dados salvos.

## Melhorias futuras

- Login por cobrador.
- Login por administrador.
- Painel online para dono da van.
- Sincronização em nuvem.
- Backup automático.
- Servidor com banco de dados.
- Autenticação real.
- Permissões por usuário.
- Envio automático de relatório por WhatsApp.
- Envio automático de relatório por e-mail.
- Validação antifraude em servidor.
- Detecção de GPS falso.
- Assinatura digital do relatório.
- Logs imutáveis.
- Google Maps oficial como opção avançada.
- Rastreamento em tempo real.
- Integração com Pix real.
- Leitura de QR Code Pix.
- Exportação PDF automática.
- Armazenamento de fotos em nuvem.
- Dashboard financeiro.
- Controle de múltiplas linhas.
- Controle de escala de motoristas.
- Relatórios por dia, semana e mês.
- Painel do dono da frota.
- App separado para administrador.
