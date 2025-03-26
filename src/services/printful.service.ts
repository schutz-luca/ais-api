import { wait } from "../utils/wait";

export const colorsMascGhost = ['preto', 'azulMarinho', 'vermelho', 'azulRoyal', 'rosaPink', 'laranja', 'amareloCanario', 'cinzaMescla', 'branco']
const colorsFemGhost = ['preto', 'branco']

export const printfulApi = {
    createMockups: async (designFront: string, designBack: string) => {
        const body = {
            "format": "jpg",
            "products": []
        }

        if (designFront) body.products = body.products.concat([
            // FRONT GHOST MALE
            {
                "source": "catalog",
                "mockup_style_ids": [6400],
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
                                "url": designFront
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
                "catalog_variant_ids": [4020, 4015],
                "orientation": "vertical",
                "placements": [
                    {
                        "placement": "front",
                        "technique": "dtg",
                        "layers": [
                            {
                                "type": "file",
                                "url": designFront
                            }
                        ]
                    }
                ]
            },
            // FRONT GHOST FEMALE
            {
                "source": "catalog",
                "mockup_style_ids": [14033],
                "catalog_product_id": 567,
                "catalog_variant_ids": [14322, 14362],
                "orientation": "vertical",
                "placements": [
                    {
                        "placement": "front",
                        "technique": "dtg",
                        "layers": [
                            {
                                "type": "file",
                                "url": designFront,
                            }
                        ]
                    }
                ]
            },
            // FRONT MOCKUPS FEMALE
            {
                "source": "catalog",
                "mockup_style_ids": [14040, 14042, 14051, 14052],
                "catalog_product_id": 567,
                "catalog_variant_ids": [14322, 14362],
                "orientation": "vertical",
                "placements": [
                    {
                        "placement": "front",
                        "technique": "dtg",
                        "layers": [
                            {
                                "type": "file",
                                "url": designFront,
                            }
                        ]
                    }
                ]
            }
        ]);
        if (designBack) body.products = body.products.concat([
            // BACK GHOST MALE
            {
                "source": "catalog",
                "mockup_style_ids": [6401],
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
                "catalog_variant_ids": [4020, 4015],
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
                "mockup_style_ids": [14034],
                "catalog_product_id": 567,
                "catalog_variant_ids": [14322, 14362],
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
                "mockup_style_ids": [14044, 14045, 14054],
                "catalog_product_id": 567,
                "catalog_variant_ids": [14322, 14362],
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

        const result: any = await (await fetch(`${process.env.PRINTFUL_API_BASE}/mockup-tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        })).json();

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
                    models: []
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
                        if (index === 4) key = 'mascGhost';
                        if (index === 6) key = 'femGhost';
                    }

                    product.catalog_variant_mockups.map((variant, index) => {
                        variant.mockups.map(mockup => {
                            // If male mock, find its Dimona color
                            if (key === 'mascGhost') mockups[key][colorsMascGhost[index]] = mockup.mockup_url;

                            // Female mocks only has black and white, if it's not on these colors, add to models
                            if (key === 'femGhost') {
                                if (!!colorsFemGhost[index]) mockups[key][colorsFemGhost[index]] = mockup.mockup_url;
                                else key = 'models'
                            }

                            if (key === 'models') mockups[key].push(mockup.mockup_url);
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
        const tasks = await printfulApi.createMockups(designUrls.designFront, designUrls.designBack);
        return await printfulApi.getTask(tasks.map(task => task.id), !!product.designBack);
    }
    catch (error) {
        console.error('Error on createPrintfulMockups:', error);
        throw { message: 'Error on Printful mockups creation: ' + error.message }; 
    }
}