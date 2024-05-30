import { addNfNumber, checkExists, getLastNf } from "../db/nf";
import { NFE } from "../model/bling.model"
import { ShopifyOrder } from "../model/shopify.model"
import { getStreetAndNumber } from "../utils/getStreetAndNumber"
import { getCustomerCpf } from './shopify.service';

function getDate() {
    return new Date()
        .toLocaleString('sv', { timeZoneName: 'short' })
        .split(' ')
        .slice(0, -1)
        .join(' ');
}

async function postNFE(nfe: NFE): Promise<any> {
    try {
        return (await fetch(`${process.env.BLING_API_BASE}/nfe`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.BLING_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(nfe)
        })).json()
    }
    catch (error) {
        console.error('Error on postNFE:', error);
    }
}

async function sendNFE(nfeId: string): Promise<any> {
    return (await fetch(`${process.env.BLING_API_BASE}/nfe/${nfeId}/enviar`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.BLING_TOKEN}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    })).json()
}

async function formatNFE(shopifyOrder: ShopifyOrder, customerCpf: string) {
    const { street, number } = getStreetAndNumber(shopifyOrder.shipping_address.address1)

    const nfeFixedFields = {
        ncmShirt: '6105.10.00',
        natureza: 15104989232,
    }

    // Last NF stored into db
    const lastNf = await getLastNf();

    const nfe: NFE = {
        tipo: 1,
        numero: `${lastNf.number + 1}`,
        dataOperacao: getDate(),
        contato: {
            nome: `${shopifyOrder.customer.first_name} ${shopifyOrder.customer.last_name}`,
            email: shopifyOrder.customer.email,
            telefone: shopifyOrder.customer.phone,
            tipoPessoa: 'F',
            contribuinte: 9, // "Não contribuente"
            numeroDocumento: customerCpf,
            endereco: {
                bairro: shopifyOrder.shipping_address.company,
                cep: shopifyOrder.shipping_address.zip,
                endereco: street,
                numero: number,
                complemento: shopifyOrder.shipping_address.address2,
                municipio: shopifyOrder.shipping_address.city,
                uf: shopifyOrder.shipping_address.province_code,
                pais: shopifyOrder.shipping_address.country_code
            },
        },
        desconto: shopifyOrder.current_total_discounts as unknown as number,
        finalidade: 1, // "Normal"
        naturezaOperacao: {
            id: nfeFixedFields.natureza
        },
        itens: shopifyOrder.line_items.map(item => ({
            codigo: item.sku,
            descricao: item.name,
            valor: item.price as unknown as number,
            quantidade: item.quantity,
            tipo: 'P',
            numeroPedidoCompra: `${shopifyOrder.id}`,
            classificacaoFiscal: nfeFixedFields.ncmShirt,
            unidade: 'UN',
            origem: 0,
        })),
        transporte: {
            frete: shopifyOrder.total_shipping_price_set.shop_money.amount as unknown as number,
            volume: { quantidade: 1 }
        }
    }

    return nfe;
}


export async function generateNFE(shopifyOrder: ShopifyOrder) {
    try {
        const nfeExists = await checkExists(shopifyOrder.id);
        if (nfeExists)
            return `NFE do pedido ${shopifyOrder.id} já existe`

        const customerCpf = await getCustomerCpf(shopifyOrder.admin_graphql_api_id);
        const formattedNFE = await formatNFE(shopifyOrder, customerCpf);

        const postResult = await postNFE(formattedNFE);

        if (!postResult.data?.id)
            return 'Erro ao criar NFE'

        const sendResult = await sendNFE(postResult.data.id)

        const xml = sendResult.data.xml as string;

        await addNfNumber(`${shopifyOrder.id}`);
        return xml.includes('Autorizado o uso da NF-e') && 'NFE enviada';
    }
    catch (error) {
        console.error('Error on generateNFE:', error)
        return error
    }

}

