# Contas externas: Z-API e Anthropic

Documento para a clínica e para quem vai operar. Explica **por que** o sistema
precisa dessas duas contas pagas, **como criar** cada uma e **onde pegar** as
credenciais.

Todo o resto já está construído e no ar. Sem essas duas contas o sistema fica
parado: não recebe nem envia mensagem, e o agente não responde.

---

## Por que precisamos de duas contas

O produto é um assistente que atende o paciente **no WhatsApp**, tira dúvidas
com texto aprovado pelo médico, agenda consulta e dispara sozinho as mensagens
de pré e pós-operatório ancoradas na data da cirurgia — incluindo a do
**shock loss** por volta do D+60, que evita o paciente entrar em pânico com a
queda dos fios.

Para isso duas coisas precisam existir, e nenhuma das duas é gratuita:

| Conta | O que ela resolve | Quem paga |
|---|---|---|
| **Z-API** | Conecta o número de WhatsApp da clínica ao sistema — é o que faz a mensagem do paciente chegar até nós e a nossa resposta voltar até ele. | Assinatura mensal por número conectado |
| **Anthropic** | É o "cérebro" do assistente: interpreta o que o paciente escreveu e decide qual ação tomar (buscar no FAQ, agendar, escalar para a equipe). | Pré-pago por uso, em dólar |

São coisas separadas e uma não substitui a outra. A Z-API é o **encanamento**;
a Anthropic é a **inteligência**. Sem a Z-API, o assistente pensa mas não fala.
Sem a Anthropic, a mensagem chega mas ninguém responde.

---

# Conta 1 — Z-API (WhatsApp)

## Por que não dá para conectar direto no WhatsApp

O WhatsApp não deixa um sistema mandar mensagem sozinho pelo aplicativo comum.
Existem só dois caminhos:

**a) API oficial da Meta (WhatsApp Business Platform).** Sancionada, sem risco
de bloqueio, mas exige verificação da empresa junto à Meta, e — o ponto que
pesa aqui — **toda mensagem enviada fora de uma janela de 24h depois da última
resposta do paciente precisa usar um modelo pré-aprovado pela Meta**. Os
disparos do protocolo (D-7, D+1, D+60 do shock loss) são exatamente esse caso:
partem da clínica, sem o paciente ter escrito antes. Cada um viraria um modelo
submetido para aprovação, e mudar o texto exige reaprovar.

**b) Gateway não oficial, como a Z-API.** Conecta-se ao WhatsApp como se fosse
um WhatsApp Web. Sobe em minutos, custa uma fração do preço e **não tem
aprovação de modelo** — o médico edita o texto do protocolo no painel e o
disparo sai. Foi o caminho escolhido no projeto.

## O risco que a clínica precisa conhecer antes de pagar

A Z-API **não é um produto oficial da Meta**. Ela funciona mantendo uma sessão
de WhatsApp Web ativa. Na prática isso significa:

- A Meta pode bloquear o número se identificar comportamento automatizado
  atípico — muitas mensagens em rajada, disparos para quem nunca escreveu,
  denúncia de paciente marcando como spam.
- Um bloqueio derruba o canal até a clínica trocar de número.

**Como reduzir o risco** (e o sistema já foi construído assim):
- Use um **número dedicado** ao atendimento, nunca o celular pessoal do médico.
- Os disparos de protocolo saem espaçados, para pacientes que já são da clínica
  e que já conversaram com o número. Não há envio em massa para lista fria.
- O agente responde uma vez por conversa, com agrupamento de 6 segundos, então
  não gera rajada.

Se a clínica preferir a segurança da API oficial, é uma troca possível — muda o
custo, adiciona a etapa de verificação junto à Meta e obriga a submeter os
textos do protocolo como modelos. Vale conversar antes de assinar.

## O que ter em mãos antes de começar

1. **Um chip/número de celular dedicado** à clínica. Requisitos:
   - Não pode estar em uso na API oficial do WhatsApp Business.
   - Se já é o número que a clínica usa com pacientes hoje, funciona — mas
     saiba que ele passará a ser controlado pelo sistema.
   - O aparelho com o chip precisa ficar ligado e com internet para a conexão
     inicial (leitura do QR Code) e para o WhatsApp não derrubar a sessão.
2. **Cartão de crédito** para a assinatura (a Z-API é brasileira, cobra em real
   e aceita cartão nacional).

## Passo a passo

1. Acesse **https://z-api.io** e crie a conta.
2. No painel, crie uma **instância**. Cada instância = um número de WhatsApp
   conectado. Para a clínica, **uma instância basta**.
3. Escolha o plano e finalize o pagamento. A instância só conecta depois de
   ativa. (Confira o valor vigente no site — a Z-API cobra por instância/mês.)
4. Abra a instância e clique em **conectar**. Vai aparecer um **QR Code**.
5. No celular com o chip dedicado: WhatsApp → **Aparelhos conectados** →
   **Conectar um aparelho** → aponte para o QR Code da tela.
6. A instância deve mudar para o status **conectado**.

## As três credenciais que preciso receber

Todas ficam no painel da Z-API. Anote e me envie:

| Credencial | Onde encontrar | Cara de quê |
|---|---|---|
| **ID da instância** | Tela da instância, campo *ID* | `3AB1C2D3E4F5...` |
| **Token da instância** | Mesma tela, campo *Token* | string longa |
| **Client-Token** (token de segurança da conta) | Menu de **segurança** da conta, não da instância | string longa |

O **Client-Token é da conta inteira**, não de uma instância — é o que mais gera
confusão. Se a Z-API tiver a opção de segurança de conta desativada, ative:
sem ele, qualquer um com o ID e o token consegue mandar mensagem pelo seu número.

> ⚠️ **Essas três credenciais dão controle total do WhatsApp da clínica.** Mande
> por um canal privado, nunca em grupo, e-mail aberto ou print em conversa. Elas
> vão direto para os secrets do Supabase e nunca ficam gravadas no banco nem
> chegam ao navegador.

## Uma configuração a mais (essa eu faço)

Depois de criada a instância, é preciso apontar o **webhook "Ao receber"** para
o nosso endereço, senão as mensagens dos pacientes não chegam. O endereço já
está pronto e documentado em [WHATSAPP.md](./WHATSAPP.md) — pode deixar comigo,
ou seguir o passo lá se preferir fazer.

---

# Conta 2 — Anthropic (a IA)

## Por que Claude, e por que o modelo Haiku

O assistente precisa entender português coloquial de WhatsApp ("to com o couro
ardendo aqui, é normal?") e decidir o que fazer com aquilo — buscar no FAQ,
registrar o sintoma, ou parar tudo e chamar a equipe.

Escolhemos o **Claude Haiku 4.5**, da Anthropic, porque:

- É o modelo mais barato e rápido da linha, e a tarefa aqui é bem delimitada —
  não precisamos do modelo mais caro.
- Ele **não decide nada clínico**. O sistema foi construído para que o modelo
  só entregue texto que o médico já aprovou e chame funções que o nosso código
  valida. Quem classifica gravidade de sintoma é uma regra fixa no banco, não a
  IA. Quem confirma horário livre é o banco, não a IA.
- Diante de qualquer sinal de alerta ele é obrigado a parar, avisar a equipe e
  **se desligar daquela conversa** até um humano reativar.

## Ponto de atenção antes de criar

**Assinatura do Claude.ai (Pro/Max) NÃO serve.** São produtos diferentes: o
Claude.ai é o chat para uso pessoal; o que precisamos é a **API**, cobrada
separadamente e por uso. Pagar o Pro não libera a chave.

A Anthropic é uma empresa americana: **cobrança em dólar, cartão internacional**
(crédito com função internacional habilitada). É pré-pago — você põe crédito e
ele vai sendo consumido. Não há assinatura mensal fixa.

## Passo a passo

1. Acesse **https://console.anthropic.com** e crie a conta (é o Console de
   desenvolvedor, diferente do claude.ai).
2. Em **Billing / Plans**, adicione um cartão e compre um crédito inicial.
   Comece com o mínimo — o consumo estimado abaixo é baixo e dá para calibrar
   no primeiro mês.
3. Em **API Keys**, clique em criar uma chave. Dê um nome que identifique o uso,
   por exemplo `postcare-whatsapp`.
4. **Copie a chave na hora.** Ela começa com `sk-ant-` e só aparece uma vez; se
   perder, é preciso gerar outra.
5. Recomendado: em **Limits**, defina um teto de gasto mensal. É a rede de
   segurança contra qualquer surpresa.

## Quanto isso custa, na prática

O Haiku 4.5 cobra **US$ 1 por milhão de tokens de entrada** e **US$ 5 por milhão
de saída** (token ≈ pedaço de palavra).

Medi o tamanho real do que o nosso sistema manda a cada mensagem:

| Parte | Tamanho |
|---|---|
| Definição das 9 ferramentas | ~1.400 tokens |
| Instruções e regras de segurança | ~600 tokens |
| FAQ aprovado (7 respostas hoje) | ~250 tokens |
| Dados do paciente + histórico recente | ~370 tokens |
| **Entrada por chamada** | **~2.600 tokens** |

Uma troca de mensagem costuma usar 2 chamadas (uma para consultar o FAQ, outra
para redigir a resposta), somando ~5.200 tokens de entrada e ~250 de saída:

> **≈ US$ 0,007 por troca de mensagem** — menos de um centavo de dólar.

Projetando:

| Cenário | Custo estimado/mês |
|---|---|
| 50 pacientes ativos, 20 trocas cada | ~US$ 7 |
| 100 pacientes ativos, 20 trocas cada | ~US$ 14 |
| 200 pacientes ativos, 30 trocas cada | ~US$ 42 |

**Os disparos de protocolo não custam nada de IA.** D-7, D+1, D+60 e os demais
são texto pronto escrito pelo médico — vão direto para a Z-API sem passar pelo
modelo. Só as respostas a mensagens do paciente consomem crédito.

São estimativas com base no tamanho medido, não uma promessa. Vale conferir o
consumo real no Console depois do primeiro mês.

### Uma otimização que ainda não está valendo

A Anthropic dá ~90% de desconto na parte repetida do texto que enviamos
("prompt caching"), mas o Haiku 4.5 só ativa o desconto se essa parte tiver
**pelo menos 4.096 tokens**. Hoje a nossa está em **~2.250** — abaixo do
mínimo, então o desconto não entra.

O que fecha essa lacuna é justamente o que já está na lista do médico:
**cadastrar o FAQ oficial**. Cada resposta aprovada engorda esse bloco. Com as
7 respostas atuais (média de 128 caracteres) faltam cerca de 6.500 caracteres —
algo como 30 a 50 perguntas frequentes bem escritas. Ou seja: escrever o FAQ
melhora a resposta ao paciente **e** derruba o custo. Não é urgente, o valor
absoluto já é baixo, mas é bom saber que existe.

---

## O que me enviar quando tiver

```
Z-API
  ID da instância  : ...
  Token da instância: ...
  Client-Token      : ...
  Número conectado  : +55...

Anthropic
  API Key: sk-ant-...
```

Com isso eu configuro os secrets, vinculo o número da clínica, aponto o webhook
e fazemos o teste ponta a ponta — enviar uma mensagem de um celular real e ver
a resposta chegar. O procedimento está em [WHATSAPP.md](./WHATSAPP.md).

## Checklist

**Z-API**
- [ ] Conta criada
- [ ] Chip/número dedicado definido
- [ ] Instância criada e plano pago
- [ ] QR Code lido, status *conectado*
- [ ] Segurança de conta ativada (Client-Token)
- [ ] Três credenciais anotadas e enviadas por canal privado

**Anthropic**
- [ ] Conta criada no console.anthropic.com (não é o claude.ai)
- [ ] Cartão internacional cadastrado e crédito inicial comprado
- [ ] Teto de gasto mensal definido
- [ ] Chave `sk-ant-` criada e copiada
- [ ] Chave enviada por canal privado

**Decisão do médico** (não bloqueia a criação das contas, mas bloqueia o
funcionamento do protocolo)
- [ ] Textos dos disparos de pré e pós-operatório, incluindo o do shock loss —
      hoje são placeholders, e o sistema se recusa a enviá-los ao paciente
- [ ] Lista final de sinais de alerta que pausam o assistente
- [ ] FAQ oficial (ver a otimização de custo acima)
- [ ] Horário de atendimento real — hoje está fixo em seg–sex, 9h–18h
