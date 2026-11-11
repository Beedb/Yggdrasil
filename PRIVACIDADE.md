# Privacidade

O Yggdrasil é um programa que **roda no seu computador**. Quem o publica não recebe nenhum dado seu: não há conta, servidor central, telemetria, analytics nem cookies de rastreamento.

## Onde ficam os dados

Tudo fica na pasta do Yggdrasil, no seu PC:

- `dados.json` e `perfis/`: links, agenda, tarefas, notas e ajustes de cada perfil;
- `email-contas/`: tokens do Outlook e senhas de app de outros provedores;
- `ia-config.json`: a chave da API do Gemini;
- `resumos/`: os compilados gerados;
- `backups/`: cópias diárias.

No Linux e no macOS os arquivos de segredo ficam com permissão só para o seu usuário (`600`). **No Windows essa proteção não existe**: qualquer usuário com acesso à pasta consegue ler. Use uma conta do Windows só sua, ou disco criptografado.

## O que sai do seu PC (e só quando você liga)

| Função | Para onde vai | O que vai |
| --- | --- | --- |
| Email do Outlook | Microsoft (Graph API) | O necessário para ler, enviar e organizar o seu email |
| Email IMAP/SMTP (Gmail, Yahoo, etc.) | O servidor do seu provedor | Idem |
| Compilado das newsletters (IA) | Google (Gemini API) | O texto dos emails recebidos no período, que pode conter dados de outras pessoas. Use uma chave de projeto **com faturamento ativo**: os termos da API proíbem enviar dados pessoais no uso gratuito |
| Ícones dos sites | DuckDuckGo (`icons.duckduckgo.com`) | O endereço (domínio) de cada link salvo. Vem desligado |
| Agenda externa (.ics) | O endereço que você colar | Só o pedido para baixar a agenda |

## Acesso pela rede

Por padrão, só o próprio PC abre o Yggdrasil. Se você ligar "outros aparelhos da rede" em Ajustes > Endereços, qualquer aparelho no mesmo wifi alcança o Yggdrasil **sem criptografia (http)**. Use só em rede de confiança e coloque PIN nos perfis. Para acessar de fora de casa, use uma VPN (ex.: Tailscale, WireGuard); não abra a porta no roteador.

## LGPD

Usado para fins pessoais, o tratamento é seu e fica fora da LGPD (art. 4º, I). Se você usar o Yggdrasil para tratar dados de outras pessoas com fins econômicos (por exemplo, numa empresa), você é o controlador desses dados e as obrigações da LGPD são suas.
