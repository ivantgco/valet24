var paramExample = {
    required: true,
    default: 'test',
    valueMethod:'val', // html() ...
    validation: { // Здесь может быть объект, массив или значение. Объект использует format, func
        format: [
            {
                func: 'addToEnd',
                args: ['Добавим текст в конец']
            },
            {
                func: 'addToEnd',
                args: ['Еще добавим.']
            }
        ],
        func: 'notNull'
    }
};


var methodos = {
    get_category: {
        name:'get_category',
        name_ru:'Запросить категории',
        description:'Вернет список категорий товаров. Можно передать id через "," и параметр is_root',
        responseJSON:
            '' +
            '\nНет примера\n' +
            '',
        o:{
            command:'get_category',
            params:{
                id:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно передать id категории или несколько через запяту. Можно не передавать, будет полный набор'
                },
                is_root:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'true/false Вернет только корневые категории'
                },
                columns:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно передать столбцы через запятую'
                }
            }
        }
    },
    get_product: {
        name:'get_product',
        name_ru:'Запросить Продукты',
        description:'Вернет список продуктов. Можно передать id через запятую.<br>' +
        'Можно искать по имени или фильтровать по категории/подкатегории',
        responseJSON:
        '' +
        '\nНет примера\n' +
        '',
        o:{
            command:'get_product',
            params:{
                id:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно передать id товара или несколько через запяту. Можно не передавать, будет полный набор'
                },
                category_id:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно передать id категории или несколько через запяту. Можно не передавать, будет полный набор'
                },
                parent_category_id:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно передать id подкатегории или несколько через запяту. Можно не передавать, будет полный набор'
                },
                name:{
                    required:false,
                    default:'',
                    description: 'Можно вводить неполное название.'
                },
                columns:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно передать столбцы через запятую'
                }
            }
        }
    }
};