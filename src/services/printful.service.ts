import { getImageDimensions } from "../utils/getImageDimensions";
import { wait } from "../utils/wait";

export const colorsMascGhost = ['preto', 'azulMarinho', 'vermelho', 'azulRoyal', 'rosaPink', 'laranja', 'amareloCanario', 'cinzaMescla', 'branco']
const colorsFemGhost = ['preto', 'branco']

export const printfulApi = {
    createMockups: async (designFront: string, designBack: string, product) => {
        const body = {
            "format": "jpg",
            "products": []
        }

        if (designFront) {
            const imgSizes = await getImageDimensions(product.designFrontMale.buffer);

            const calculatePosition = () => {
                const maxHeight = 16;
                const maxWidth = 12;
                const offset = 2;

                let width;
                let height;
                let top;
                let left;

                if (imgSizes.height > imgSizes.width) {
                    height = maxHeight - offset;
                    width = (imgSizes.width * height) / imgSizes.height;

                }
                else {
                    width = 12;
                    height = (imgSizes.height * width) / imgSizes.width;
                }
                top = offset;
                left = (maxWidth - width) / 2;

                return {
                    width,
                    height,
                    top,
                    left
                }
            }

            body.products = body.products.concat([
                // FRONT GHOST MALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [1093],
                    "catalog_product_id": 71,
                    "catalog_variant_ids": [4020, 4015, 4145, 4147, 4130, 4185, 4045, 4175, 4115],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "front",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designFront,
                                    "position": calculatePosition()
                                }
                            ]
                        }
                    ]
                },
                // FRONT MOCKUP MALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [891, 798, 839, 758, 1127],
                    "catalog_product_id": 71,
                    "catalog_variant_ids": [4015],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "front",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designFront,
                                    "position": calculatePosition()
                                }
                            ]
                        }
                    ]
                },
                // FRONT GHOST FEMALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [539],
                    "catalog_product_id": 12,
                    "catalog_variant_ids": [629, 597],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "front",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designFront,
                                    "position": calculatePosition()
                                }
                            ]
                        }
                    ]
                },
                // FRONT MOCKUPS FEMALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [20273, 20279, 496],
                    "catalog_product_id": 12,
                    "catalog_variant_ids": [629],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "front",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designFront,
                                    "position": calculatePosition()
                                }
                            ]
                        }
                    ]
                },
                // FRONT MOCKUPS FEMALE LIFESTYLE (MALE PRODUCT)
                {
                    "source": "catalog",
                    "mockup_style_ids": [768, 772, 788],
                    "catalog_product_id": 71,
                    "catalog_variant_ids": [4015],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "front",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designFront,
                                    "position": calculatePosition()
                                }
                            ]
                        }
                    ]
                },
                // FRONT MOCKUPS FEMALE LIFESTYLE (FEMALE PRODUCT)
                {
                    "source": "catalog",
                    "mockup_style_ids": [728, 730],
                    "catalog_product_id": 12,
                    "catalog_variant_ids": [629],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "front",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designFront,
                                    "position": calculatePosition()
                                }
                            ]
                        }
                    ]
                },
            ]);
        }
        if (designBack) {
            body.products = body.products.concat([
                // BACK GHOST MALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [1098],
                    "catalog_product_id": 71,
                    "catalog_variant_ids": [4020, 4015, 4145, 4147, 4130, 4185, 4045, 4175, 4115],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "back",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designBack
                                }
                            ]
                        }
                    ]
                },
                // BACK MOCKUP MALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [892, 922, 924, 759, 759],
                    "catalog_product_id": 71,
                    "catalog_variant_ids": [4020],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "back",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designBack
                                }
                            ]
                        }
                    ]
                },
                // BACK GHOST FEMALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [540],
                    "catalog_product_id": 12,
                    "catalog_variant_ids": [629, 597],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "back",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designBack
                                }
                            ]
                        }
                    ]
                },
                // BACK MOCKUPS FEMALE
                {
                    "source": "catalog",
                    "mockup_style_ids": [20272, 20278, 499],
                    "catalog_product_id": 12,
                    "catalog_variant_ids": [629],
                    "orientation": "vertical",
                    "placements": [
                        {
                            "placement": "back",
                            "technique": "dtg",
                            "layers": [
                                {
                                    "type": "file",
                                    "url": designBack
                                }
                            ]
                        }
                    ]
                }
            ]);
        }
        const result: any = await (await fetch(`${process.env.PRINTFUL_API_BASE}/mockup-tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        })).json();

        if (result?.error) throw result.error;
        return result?.data;
    },
    getTask: async (ids: string[], hasBack: boolean) => {
        try {

            const queryIds = ids.join(',');
            const result: any = await (await fetch(`${process.env.PRINTFUL_API_BASE}/mockup-tasks?id=${queryIds}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
                }
            })).json();

            if (result?.data?.some(task => task.status === 'pending')) {
                console.log('Task pending, waiting...', result);
                await wait(10000);
                return await printfulApi.getTask(ids, hasBack);
            }

            else {
                const mockups = {
                    femGhost: {},
                    mascGhost: {},
                    models: [],
                    mascMock: [],
                    femMock: [],
                    femMockLifestyle: []
                };
                console.log('Tasks completed:', result);
                result?.data?.map((product, index) => {
                    console.log('Product', index, `| has back design: ${hasBack} |`, product);
                    let key = 'models'

                    if (!hasBack) {
                        if (index === 0) key = 'mascGhost';

                        if (index === 2) key = 'femGhost';

                    }
                    // When there's back design, set it as variant image
                    else {
                        if (index === 6) key = 'mascGhost';
                        if (index === 8) key = 'femGhost';
                    }

                    if (index === 1) key = 'mascMock';
                    if (index === 3) key = 'femMock'
                    if (index === 4 || index === 5) key = 'femMockLifestyle'

                    product.catalog_variant_mockups.map((variant, index) => {
                        variant.mockups.map(mockup => {
                            // If male mock, find its Dimona color
                            if (key === 'mascGhost') mockups[key][colorsMascGhost[index]] = mockup.mockup_url;

                            // Female mocks only has black and white, if it's not on these colors, add to models
                            else if (key === 'femGhost') {
                                if (!!colorsFemGhost[index]) mockups[key][colorsFemGhost[index]] = mockup.mockup_url;
                                else key = 'models'
                            }

                            else mockups[key].push(mockup.mockup_url);
                        })
                    })
                });

                console.log(mockups);
                return mockups;
            }

        }
        catch (error) {
            console.error(error);
        }
    }
}

export const createPrintfulMockups = async (product: any, designUrls: any) => {
    try {
        const tasks = await printfulApi.createMockups(designUrls.designFrontMale, designUrls.designBackMale, product);
        return await printfulApi.getTask(tasks.map(task => task.id), !!product.designBackMale);
    }
    catch (error) {
        console.error('Error on createPrintfulMockups:', error);
        throw { message: 'Error on Printful mockups creation: ' + error.message };
    }
}