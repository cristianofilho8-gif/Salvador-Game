# Controle de Van

App web local/mobile-first para cobradores de van controlarem passageiros, pagamentos em dinheiro/Pix, trecho Luso, fotos obrigatórias no trajeto e relatório final da viagem.

## Arquivos do projeto

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

O arquivo `sw.js` foi adicionado para cache offline quando o app roda em `localhost` ou HTTPS. Ao abrir direto pelo arquivo `index.html`, o app funciona como página local, mas recursos como PWA completo, service worker e geolocalização podem depender do navegador.

## Como abrir o app

### Modo simples

1. Abra a pasta `controle-van`.
2. Toque/clique em `index.html`.
3. O navegador abrirá o app.

Contadores, pagamentos, histórico e relatórios funcionam localmente. Câmera e GPS dependem das permissões do navegador e do celular.

### Modo recomendado para PWA e GPS

Em computador, dentro da pasta do projeto, rode um servidor local:

```bash
python -m http.server 8080
```

Depois abra:

```text
http://localhost:8080
```

No celular, o ideal é hospedar em HTTPS ou usar uma rede local com servidor. Muitos navegadores só liberam geolocalização e service worker em HTTPS ou `localhost`.

## Como instalar no celular

No Chrome/Android:

1. Abra o app pelo navegador.
2. Toque no menu de três pontos.
3. Toque em **Adicionar à tela inicial** ou **Instalar app**.
4. Abra o app pelo ícone criado.

No iPhone/Safari:

1. Abra o app no Safari.
2. Toque no botão de compartilhamento.
3. Toque em **Adicionar à Tela de Início**.

## Como usar durante a viagem

1. Na tela inicial, toque em **Nova Viagem**.
2. Escolha **Ida** ou **Volta**.
3. Use os botões `+1` a `+10` para registrar passageiros de passagem inteira.
4. Use os botões `-1` a `-10` para corrigir erro, sem deixar contador negativo.
5. Em **Pagamentos**, registre:
   - `+1 passagem dinheiro`
   - `+1 passagem Pix`
   - `+1 Luso dinheiro`
   - `+1 Luso Pix`
6. Acompanhe:
   - valor esperado;
   - recebido em dinheiro;
   - recebido em Pix;
   - diferença/falta receber.
7. Ao chegar no Luso, toque em **Registrar Luso**.
8. Ao final, toque em **Encerrar Viagem** para gerar o relatório.

## Como funciona o Luso

A tarifa normal é R$ 5,00 e o Luso é R$ 2,50.

Na **ida**, quando o cobrador informa quantas pessoas desceram no Luso, o app converte essas pessoas de passagem inteira para tarifa Luso. Isso evita que alguém que desceu no meio do caminho seja contado como R$ 5,00.

Na **volta**, quando o cobrador informa quantas pessoas entraram no Luso, o app adiciona essas pessoas diretamente como tarifa Luso.

Cada evento do Luso salva:

- horário;
- sentido;
- quantidade de pessoas;
- valor esperado;
- pagamento em dinheiro;
- pagamento em Pix.

## Área do administrador

A área administrativa é protegida por PIN.

PIN padrão inicial:

```text
1234
```

Na primeira versão, o PIN fica salvo no `localStorage`. Isso é simples e prático, mas não é segurança forte. Em produção, a autenticação deve ser feita em servidor.

### Configurar valores

Na área administrativa, é possível alterar:

- valor da passagem inteira;
- valor da passagem Luso.

As novas tarifas valem para novas viagens. Viagens já iniciadas mantêm o valor salvo no início da viagem.

### Configurar pontos de foto

Cada ponto obrigatório pode ter:

- nome;
- latitude;
- longitude;
- raio de tolerância em metros;
- sentido: ida, volta ou ambos;
- obrigatório ou opcional;
- ordem no trajeto.

Durante a viagem, quando o GPS entra no raio de um ponto obrigatório compatível com o sentido, o app gera alerta e marca a foto como pendente até que seja registrada.

### Configurar ponto Luso

O administrador pode configurar:

- nome do ponto Luso;
- latitude;
- longitude;
- raio de tolerância.

Quando o GPS se aproxima desse ponto, o app sugere registrar a movimentação do Luso.

## Fotos obrigatórias

O app usa:

```html
<input type="file" accept="image/*" capture="environment">
```

Isso prioriza a câmera traseira do celular. Ao registrar a foto, o app salva:

- prévia reduzida em base64;
- nome do ponto;
- data e hora automáticas;
- latitude e longitude atuais;
- distância até o ponto cadastrado;
- sentido da viagem;
- status da foto;
- marcação de suspeita se estiver fora do raio permitido.

A prévia da imagem é reduzida antes de salvar para diminuir risco de lotar o `localStorage`.

## Fotos pendentes

Uma foto fica pendente quando:

1. o app detecta entrada no raio do ponto obrigatório;
2. o alerta é gerado;
3. nenhuma foto é registrada naquele ponto.

Pendências aparecem:

- na tela principal;
- no relatório final;
- no histórico;
- na área administrativa.

O cobrador comum não possui botão para apagar pendências. Somente o administrador pode justificar pendências no relatório.

## Segurança contra burla

Esta versão implementa medidas simples:

- solicita captura pela câmera traseira;
- registra horário automático;
- registra GPS automático;
- calcula distância entre foto e ponto obrigatório;
- marca foto como suspeita se estiver fora do raio;
- bloqueia edição manual de horário e localização pela interface;
- não oferece exclusão de fotos/pendências ao cobrador comum;
- salva logs importantes da viagem;
- salva histórico local.

Limitação importante: por ser um app local em HTML/CSS/JS, ele dificulta fraude, mas não impede 100% adulterações avançadas, GPS falso, edição do `localStorage` ou manipulação do navegador. Para segurança real, é necessário servidor, login, validação remota, assinatura digital e trilha de auditoria protegida.

## Histórico e relatório

Cada viagem encerrada salva no histórico:

- data;
- horário de início;
- horário de fim;
- sentido;
- total de passageiros;
- valor esperado;
- dinheiro recebido;
- Pix recebido;
- diferença;
- fotos tiradas;
- fotos pendentes;
- fotos suspeitas;
- eventos do Luso;
- log da viagem.

O botão **Exportar relatório** gera um JSON copiável.

## Testes realizados / checklist obrigatório

A sintaxe do JavaScript foi validada com `node --check app.js`.

Além disso, o app possui fluxo visual para os seguintes testes manuais:

### Passageiros

- Adicionar `+1` passageiro: o total sobe para 1 e o esperado vira R$ 5,00.
- Adicionar `+10` passageiros: o total soma 10 e o esperado soma 10 tarifas inteiras.
- Remover `-1` passageiro: o total reduz sem ficar negativo.
- Tentar remover com contador zerado: o app impede valor negativo.
- Conferir cálculo do valor esperado: `inteiras × tarifa inteira + Luso × tarifa Luso`.

### Pagamentos

- Adicionar pagamento em dinheiro: soma R$ 5,00 no dinheiro.
- Adicionar pagamento em Pix: soma R$ 5,00 no Pix.
- Remover pagamento: reduz o contador correspondente.
- Tentar remover pagamento zerado: o app impede valor negativo.
- Conferir diferença: `recebido - esperado`, mostrando falta ou sobra.

### Luso

- Registrar Luso na ida: pessoas informadas são convertidas de inteira para Luso.
- Registrar Luso na volta: pessoas informadas são adicionadas como Luso.
- Conferir tarifa de R$ 2,50 por pessoa.
- Conferir evento salvo no relatório, com horário, sentido, quantidade, esperado, dinheiro e Pix.

### Fotos

- Cadastrar ponto obrigatório no administrador.
- Iniciar viagem no sentido compatível.
- Usar **Simular chegada** na lista de pontos para gerar alerta de foto.
- Ver a foto aparecer como pendente.
- Tirar foto pela câmera/input do celular.
- Conferir registro com horário, GPS e distância.
- Simular/tirar foto fora do raio para marcar como suspeita.

### Administrador

- Tentar entrar com PIN errado: acesso bloqueado.
- Entrar com PIN `1234`: acesso permitido.
- Cadastrar ponto: ponto aparece na lista.
- Editar ponto: campos são preenchidos e atualizados.
- Remover ponto: ponto sai da lista sem apagar relatórios antigos.
- Alterar valores de passagem: novas viagens usam os novos valores.

### Histórico

- Encerrar viagem: relatório é gerado.
- Voltar ao histórico: viagem aparece na lista.
- Abrir relatório: dados salvos são exibidos.
- Exportar relatório: JSON copiável é gerado.

## Melhorias futuras

- Login por cobrador.
- Painel online para dono da van.
- Sincronização em nuvem.
- Backup automático.
- Envio automático de relatório por WhatsApp ou e-mail.
- Validação antifraude em servidor.
- Detecção de GPS falso.
- Assinatura digital do relatório.
- Mapa visual com Leaflet ou Google Maps.
- Exportação em PDF.
- Integração com Pix real.
- IndexedDB para armazenar fotos com mais segurança e capacidade.
- Controle de permissões por perfil: cobrador, fiscal e administrador.
