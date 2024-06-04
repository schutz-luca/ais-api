export interface NFe {
    tipo: number
    numero: string
    dataOperacao: string
    contato: Contato
    naturezaOperacao: NaturezaOperacao
    finalidade: number
    seguro?: number
    despesas?: number
    desconto: number
    observacoes?: string
    itens: Item[]
    transporte: Transporte
    intermediador?: Intermediador
  }
  
  export interface Contato {
    nome: string
    tipoPessoa: string
    numeroDocumento?: string
    ie?: string
    rg?: string
    contribuinte: number
    telefone: string
    email: string
    endereco: Endereco
  }
  
  export interface Endereco {
    endereco: string
    numero: string
    complemento: string
    bairro: string
    cep: string
    municipio: string
    uf: string
    pais?: string
  }
  
  export interface NaturezaOperacao {
    id: number
  }
  
  export interface Item {
    codigo: string
    descricao: string
    unidade: string
    quantidade: number
    valor: number
    tipo: string
    pesoBruto?: number
    pesoLiquido?: number
    numeroPedidoCompra: string
    classificacaoFiscal: string
    cest?: string
    codigoServico?: string
    origem: number
    informacoesAdicionais?: string
  }
  
  export interface Transporte {
    frete: number
    transportador?: Transportador
    volume: Volume
    volumes?: Volume2[]
  }
  
  export interface Transportador {
    nome: string
    numeroDocumento: string
    ie: string
    endereco: Endereco2
  }
  
  export interface Endereco2 {
    endereco: string
    municipio: string
    uf: string
  }
  
  export interface Volume {
    quantidade: number
    especie?: string
    numero?: string
    pesoBruto?: number
    pesoLiquido?: number
  }
  
  export interface Volume2 {
    servico: string
    codigoRastreamento: string
  }
  
  export interface Intermediador {
    cnpj: string
    nomeUsuario: string
  }
  