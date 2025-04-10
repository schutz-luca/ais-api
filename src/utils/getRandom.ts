export function getRandom(max: number, prevent?: number, min: number = 0) {
    min = Math.ceil(min);
    max = Math.floor(max);

    let rand;
    do {
        rand = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (prevent !== undefined && rand === prevent);

    return rand;
}