# Controle de Van

App web local/mobile-first para cobradores de van controlarem passageiros, pagamentos em dinheiro/Pix, trecho Luso, fotos obrigatórias no trajeto, localização da van e relatório final da viagem.

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

O `sw.js` permite cache offline quando o app roda em `localhost` ou HTTPS. Abrindo direto pelo `index.html`, o app funciona como página local, mas PWA completo, câmera, GPS e service worker podem depender do navegador.

## Como abrir o app

### Modo simples

1. Abra a pasta `controle-van`.
2. Toque/clique em `index.html`.
3. O navegador abrirá o app.

Contadores, pagamentos, histórico, relatórios e cadastros funcionam localmente. Câmera, GPS, vibração e instalação como PWA dependem das permissões do celular/navegador.

### Modo recomendado para PWA, GPS e câmera

Em computador, dentro da pasta do projeto, rode:

```bash
python -m http.server 8080
```

Depois abra:

```text
http://localhost:8080
```

No celular, o ideal é hospedar em HTTPS, por exemplo GitHub Pages, Netlify ou Vercel. Muitos navegadores só liberam geolocalização, service worker e instalação PWA em HTTPS ou `localhost`.

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

## Primeiro uso

Antes de iniciar a primeira viagem, entre na **Área do Administrador**.

PIN padrão:

```text
1234
```

Cadastre pelo menos uma pessoa/van em **Cadastro de cobradores e vans**. Cada viagem agora precisa ficar vinculada a um cadastro com:

- nome da pessoa;
- número da van;
- telefone ou observação opcional.

Depois configure os pontos obrigatórios de foto, o ponto Luso e a duração média da rota.

## Como usar durante a viagem

1. Na tela inicial, toque em **Nova Viagem**.
2. Selecione o cadastro da pessoa/van.
3. Escolha **Ida** ou **Volta**.
4. Use os botões `+1` a `+10` para registrar passageiros de passagem inteira.
5. Use os botões `-1` a `-10` para corrigir erro, sem deixar contador negativo.
6. Em **Pagamentos**, registre dinheiro, Pix e pagamentos do Luso.
7. Ao chegar no Luso, toque em **Registrar Luso** ou aceite a sugestão automática quando o GPS detectar proximidade.
8. Quando aparecer alerta de foto, toque em **Tirar Foto Agora**.
9. Ao final, toque em **Encerrar Viagem**.

## Como funciona o Luso

A tarifa normal é R$ 5,00 e o Luso é R$ 2,50.

Na **ida**, quando o cobrador informa quantas pessoas desceram no Luso, o app converte essas pessoas de passagem inteira para tarifa Luso. Isso evita cobrar R$ 5,00 de quem só fez metade do trecho.

Na **volta**, quando o cobrador informa quantas pessoas entraram no Luso, o app adiciona essas pessoas diretamente como tarifa Luso.

Cada evento do Luso salva horário, sentido, quantidade, valor esperado, dinheiro e Pix.

## Alerta de foto obrigatório

A tela de foto foi reforçada para uso real no trajeto:

- modal maior;
- fundo vermelho de alerta;
- botão grande **Tirar Foto Agora**;
- vibração do celular usando `navigator.vibrate`, quando o aparelho/navegador suportar;
- pendência automática caso o alerta seja gerado e a foto não seja tirada.

A captura usa:

```html
<input type="file" accept="image/*" capture="environment">
```

Isso prioriza a câmera traseira. Alguns navegadores ainda podem permitir galeria; por isso o app registra horário, GPS, distância até o ponto e marca a foto como suspeita quando estiver fora do raio permitido.

## Área do administrador

### Configurar valores

É possível alterar:

- valor da passagem inteira;
- valor da passagem Luso;
- duração média da rota em minutos.

A duração média é usada para estimar a posição da van quando não houver GPS ao vivo.

### Cadastro de cobradores e vans

Permite adicionar, editar e remover cadastros de pessoa/van. Cada viagem grava:

- nome da pessoa;
- número da van;
- observação;
- horário de início/fim;
- sentido.

Viagens antigas continuam com os dados gravados mesmo se o cadastro for removido depois.

### Configurar pontos de foto no mapa

O administrador pode cadastrar pontos obrigatórios por latitude/longitude manualmente ou tocando em **Escolher no mapa**.

O mapa usa Leaflet/OpenStreetMap via internet. Para escolher um ponto:

1. Toque em **Escolher no mapa**.
2. Toque no local desejado.
3. Arraste o alfinete se quiser ajustar.
4. Toque em **Confirmar ponto**.
5. Salve o ponto.

Também existe o botão **Usar meu GPS atual**, que preenche latitude e longitude com a posição atual do celular.

Cada ponto pode ter:

- nome;
- latitude;
- longitude;
- raio de tolerância;
- ordem no trajeto;
- sentido: ida, volta ou ambos;
- obrigatório ou opcional.

### Configurar ponto Luso no mapa

O ponto Luso também pode ser configurado pelo mapa ou pelo GPS atual. Quando a viagem se aproxima do Luso, o app vibra e pergunta se deseja registrar movimentação.

## Painel visual das vans

A área administrativa tem um **Painel das vans** com mapa visual e alfinetes.

Nesta versão, o mapa visual usa Leaflet/OpenStreetMap por ser gratuito e funcionar sem chave. Cada alfinete e cada card da van também têm link **Abrir no Google Maps**, facilitando a visualização no Google Maps. Há um campo para chave Google Maps opcional já reservado para uma versão futura com API oficial do Google Maps.

Ele mostra cada van cadastrada e calcula a localização assim:

1. Se houver viagem em andamento com GPS ativo, mostra **GPS real**.
2. Se não houver GPS ao vivo, usa a última localização salva no histórico da viagem.
3. Se não houver GPS, mas houver foto ou alerta de ponto, estima pela última foto/alerta.
4. Se não houver nada disso, estima pela ordem dos pontos e pelo tempo decorrido desde o início da viagem.
5. Se não houver pontos configurados, informa que não há dados suficientes.

Limitação importante: nesta versão local, o painel só enxerga dados salvos no próprio aparelho/navegador. Para o dono da van acompanhar várias vans em tempo real de aparelhos diferentes, é necessário servidor, login e sincronização em nuvem.

## Fotos pendentes

Uma foto fica pendente quando:

1. o app detecta entrada no raio do ponto obrigatório;
2. o alerta é gerado;
3. nenhuma foto é registrada naquele ponto.

Pendências aparecem na tela principal, no relatório, no histórico e na área administrativa. O cobrador comum não possui botão para apagar pendências. Somente o administrador pode justificar pendências no relatório.

## Segurança contra burla

Esta versão implementa medidas simples:

- solicita captura pela câmera traseira;
- vibra e mostra alerta forte para foto obrigatória;
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

Ao tocar em **Encerrar Viagem**, o app primeiro abre o relatório para conferência. A viagem só entra no histórico quando o usuário tocar em **Salvar viagem**.

Depois da conferência, o relatório oferece:

- **Salvar viagem**;
- **Exportar JSON**;
- **Copiar JSON**;
- **Exportar PDF**.

O botão **Exportar PDF** abre uma versão imprimível do relatório e chama a impressão do navegador. No celular ou computador, escolha **Salvar como PDF** na tela de impressão.

Cada viagem salva no histórico registra:

- cadastro da pessoa/van;
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
- log da viagem;
- últimas localizações registradas.

O botão **Exportar JSON** gera um JSON copiável. O botão **Exportar PDF** gera a tela de impressão/salvamento em PDF.

## Testes realizados / checklist obrigatório

A sintaxe do JavaScript foi validada com:

```bash
node --check app.js
```

Fluxos manuais previstos:

### Passageiros

- Adicionar `+1` passageiro.
- Adicionar `+10` passageiros.
- Remover `-1` passageiro.
- Impedir contador negativo.
- Conferir cálculo: `inteiras × tarifa inteira + Luso × tarifa Luso`.

### Pagamentos

- Adicionar pagamento em dinheiro.
- Adicionar pagamento em Pix.
- Remover pagamento.
- Impedir pagamento negativo.
- Conferir diferença: `recebido - esperado`.

### Luso

- Registrar Luso na ida.
- Registrar Luso na volta.
- Conferir tarifa de R$ 2,50.
- Conferir evento salvo no relatório.

### Fotos

- Cadastrar ponto obrigatório.
- Escolher ponto pelo mapa.
- Usar GPS atual para preencher ponto.
- Simular chegada ao ponto.
- Gerar alerta de foto com modal forte.
- Confirmar vibração em celular compatível.
- Registrar foto.
- Manter foto pendente se fechar o alerta sem fotografar.
- Marcar foto suspeita se fora do raio.

### Administrador

- Bloquear acesso com PIN errado.
- Permitir acesso com PIN `1234`.
- Cadastrar pessoa/van.
- Editar pessoa/van.
- Remover pessoa/van.
- Cadastrar ponto.
- Editar ponto.
- Remover ponto.
- Alterar valores de passagem.
- Alterar duração média da rota.

### Painel das vans

- Cadastrar van.
- Iniciar viagem vinculada à van.
- Permitir GPS e conferir posição real.
- Bloquear/desligar GPS e conferir estimativa por ponto/tempo.
- Abrir localização no mapa externo.
- Conferir alfinetes no mapa visual do painel administrativo.

### Histórico

- Encerrar viagem.
- Salvar viagem.
- Abrir relatório.
- Conferir dados salvos.
- Exportar JSON.
- Exportar PDF usando a opção “Salvar como PDF” do navegador.

## Melhorias futuras

- Login real por cobrador.
- Painel online para dono da van.
- Sincronização em nuvem.
- Backup automático.
- Envio automático de relatório por WhatsApp ou e-mail.
- Validação antifraude em servidor.
- Detecção de GPS falso.
- Assinatura digital do relatório.
- Integração oficial com Google Maps JavaScript API usando chave protegida em servidor.
- Mapa offline ou mapa próprio da rota.
- PDF gerado diretamente como arquivo sem depender da tela de impressão.
- Integração com Pix real.
- IndexedDB para armazenar fotos com mais segurança e capacidade.
- Controle de permissões por perfil: cobrador, fiscal e administrador.
