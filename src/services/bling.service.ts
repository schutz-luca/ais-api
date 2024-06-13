import { getTokens, updateTokens } from "../db/blingtokens";
import { addNfNumber, checkExists, getLastNf } from "../db/nf";
import { DimonaSendNFe } from "../dto/dimona.dto";
import { NFe } from "../model/bling.model"
import { ShopifyOrder } from "../model/shopify.model"
import { getStreetAndNumber } from "../utils/getStreetAndNumber"
import { getCustomerCpf } from './shopify.service';


const blingApi = {
    refreshToken: async () => {
        try {
            const tokens = await getTokens();
            const body = {
                grant_type: "refresh_token",
                refresh_token: tokens.refresh
            }
            const result: any = await (await fetch(`${process.env.BLING_API_BASE}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${process.env.BLING_TOKEN}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            })).json()

            await updateTokens(result.access_token, result.refresh_token);
            console.log('Token refreshed');
        }
        catch (error) {
            console.error('Error on refreshToken:', error);
        }
    },
    postNFe: async (nfe: NFe, access: string): Promise<any> => {
        try {
            return (await fetch(`${process.env.BLING_API_BASE}/nfe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${access}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(nfe)
            })).json()
        }
        catch (error) {
            console.error('Error on postNFe:', error);
        }
    },
    sendNFe: async (nfeId: string, access: string): Promise<any> => {
        return (await fetch(`${process.env.BLING_API_BASE}/nfe/${nfeId}/enviar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
        })).json()
    },
    getNFe: async (nfeId: string, access: string): Promise<any> => {
        return (await fetch(`${process.env.BLING_API_BASE}/nfe/${nfeId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${access}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
        })).json()
    }
}

function getDate() {
    return new Date()
        .toLocaleString('sv', { timeZoneName: 'short' })
        .split(' ')
        .slice(0, -1)
        .join(' ');
}

async function formatNFe(shopifyOrder: ShopifyOrder, customerCpf: string) {
    const { street, number } = getStreetAndNumber(shopifyOrder.shipping_address.address1)

    const nfeFixedFields = {
        ncmShirt: '6105.10.00',
        natureza: 15104989232,
    }

    // Last NF stored into db
    const lastNf = await getLastNf();

    const nfe: NFe = {
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


export async function generateNFe(shopifyOrder: ShopifyOrder, isRetry?: boolean): Promise<{
    success: boolean,
    status: string,
    nfe?: DimonaSendNFe
}> {
    try {
        // Check if the order has an existing NFe on DB
        const nfeExists = await checkExists(shopifyOrder.id);
        if (nfeExists)
            return {
                status: `NFe do pedido ${shopifyOrder.id} já existe`,
                success: false
            }

        // Get required data to format NFe in Bling pattern
        const customerCpf = await getCustomerCpf(shopifyOrder.admin_graphql_api_id);
        const formattedNFe = await formatNFe(shopifyOrder, customerCpf);

        // Get access and refresh token from DB
        const tokens = await getTokens();

        const postResult = await blingApi.postNFe(formattedNFe, tokens.access);

        if (postResult.error) {
            // When error is about token, refresh it and try again
            if (postResult.error.type === 'invalid_token') {
                await blingApi.refreshToken();

                // Use `isRetry` flag to avoid looping execution
                if (!isRetry)
                    return generateNFe(shopifyOrder, true);
            }

            return {
                success: false,
                status: `${postResult.error.message}: ${postResult.error.description} /// ${postResult.error.fields && `${postResult.error.fields.map(item => item?.msg)}`}`,
            }
        }

        const nfeId = postResult.data.id;

        // Send NFe to gov system through Bling
        const sendResult = await blingApi.sendNFe(nfeId, tokens.access);

        // Check if it was sent succefully
        const xml = sendResult.data.xml as string;
        const sentNfe = xml.includes('Autorizado o uso da NF-e') ? 'NFe enviada' : `NFe não pode ser enviada... >>> ${xml}`;
        
        // Add NFe to DB
        await addNfNumber(`${shopifyOrder.id}`);

        // Get NFe to extract required data to Dimona
        const getResult = await blingApi.getNFe(nfeId, tokens.access);

        const dimonaAddNFe = {
            chave: getResult.data.chaveAcesso,
            serie: getResult.data.serie,
            numero: getResult.data.numero,
            link: getResult.data.linkPDF,
        }

        return {
            success: true,
            status: sentNfe,
            nfe: dimonaAddNFe
        }
    }
    catch (error) {
        console.error('Error on generateNFe:', error)
        return {
            success: false,
            status: `Error on generateNFe: ${error?.message || `${error}`}`
        }
    }

}

