export type Message = {
  id: string;
  direction: "in" | "out";
  body: string;
  time: string;
};

export type Conversation = {
  id: string;
  name: string;
  company: string;
  phone: string;
  status: "open" | "waiting" | "resolved";
  unread: number;
  stage: string;
  tags: string[];
  lastMessage: string;
  lastTime: string;
  messages: Message[];
};

export const conversations: Conversation[] = [
  {
    id: "c1",
    name: "Carlos Mendes",
    company: "Construtora Alfa",
    phone: "+55 11 90000-0001",
    status: "open",
    unread: 2,
    stage: "Orçamento enviado",
    tags: ["Construção", "Recompra"],
    lastMessage: "Consegue fechar com 10% de desconto?",
    lastTime: "10:42",
    messages: [
      { id: "m1", direction: "in", body: "Bom dia! Preciso de 200 pares de luvas de raspa e 50 capacetes.", time: "10:30" },
      { id: "m2", direction: "out", body: "Bom dia, Carlos! Já te envio o orçamento com prazo de entrega.", time: "10:33" },
      { id: "m3", direction: "out", body: "Orçamento enviado no seu e-mail. Qualquer dúvida, é só falar.", time: "10:38" },
      { id: "m4", direction: "in", body: "Recebi. Consegue fechar com 10% de desconto?", time: "10:42" },
    ],
  },
  {
    id: "c2",
    name: "Fernanda Lopes",
    company: "Metalúrgica Beta",
    phone: "+55 11 90000-0002",
    status: "waiting",
    unread: 0,
    stage: "Negociação",
    tags: ["Indústria"],
    lastMessage: "Vou verificar com o financeiro e retorno.",
    lastTime: "09:15",
    messages: [
      { id: "m1", direction: "in", body: "Vocês trabalham com botina de segurança com bico composite?", time: "09:02" },
      { id: "m2", direction: "out", body: "Trabalhamos sim! Posso te passar as opções e os valores.", time: "09:08" },
      { id: "m3", direction: "in", body: "Vou verificar com o financeiro e retorno.", time: "09:15" },
    ],
  },
  {
    id: "c3",
    name: "João Pereira",
    company: "Indústria Gama",
    phone: "+55 11 90000-0003",
    status: "open",
    unread: 1,
    stage: "Novo contato",
    tags: ["Novo"],
    lastMessage: "Vi o anúncio de vocês, queria um catálogo.",
    lastTime: "Ontem",
    messages: [
      { id: "m1", direction: "in", body: "Vi o anúncio de vocês, queria um catálogo.", time: "17:20" },
    ],
  },
  {
    id: "c4",
    name: "Marcos Silva",
    company: "Segurança Delta",
    phone: "+55 11 90000-0004",
    status: "resolved",
    unread: 0,
    stage: "Ganho",
    tags: ["Cliente", "Recompra"],
    lastMessage: "Pedido recebido, tudo certo. Obrigado!",
    lastTime: "Seg",
    messages: [
      { id: "m1", direction: "out", body: "Marcos, seu pedido saiu para entrega hoje.", time: "14:00" },
      { id: "m2", direction: "in", body: "Pedido recebido, tudo certo. Obrigado!", time: "16:45" },
    ],
  },
];
