export interface DimonaSendNFe {
    chave: string,
    serie: string,
    numero: string,
    link: string,
}

export interface DimonaOrderCreation {
    order_id: string;

    customer_name: string;
    customer_email: string;
    customer_document: string;

    // shipping_speed: string;
    // delivery_method_id: string;

    items: DimonaOrderItem[];
    address: DimonaOrderAddress;
}

export interface DimonaOrderItem {
    name: string;
    sku: string;
    qty: number;
    dimona_sku_id: string;
    designs: string[];
    mocks: string[];
    gender: string | null;
    color: string | null;
    size: string | null;
    model: string | null;
}

export interface DimonaOrderAddress {
    zipcode: string;
    state: string;
    city: string;
    neighborhood: string;
    street: string;
    number: string;
    complement?: string;
}