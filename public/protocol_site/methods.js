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
    },
    get_cart: {
        name:'get_cart',
        name_ru:'Получить корзину',
        description:'Вернет содержимое корзины',
        responseJSON:
        '' +
        '\nНет примера\n' +
        '',
        o:{
            command:'get_cart',
            params:{
                columns:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно передать столбцы через запятую'
                }
            }
        }
    },
    add_product_in_cart: {
        name:'add_product_in_cart',
        name_ru:'Добавить продукт в корзину',
        description:'',
        responseJSON:
        '' +
        '\nНет примера\n' +
        '',
        o:{
            command:'add_product_in_cart',
            params:{
                product_id:{
                    required:true,
                    default:'',
                    validation:'notNull',
                    description: 'Необходимо передать № продукта.'
                },
                product_count:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно добавить несколько'
                }
            }
        }
    },
    remove_product_from_cart: {
        name:'add_product_in_cart',
        name_ru:'Удалит продукт из корзины',
        description:'',
        responseJSON:
        '' +
        '\nНет примера\n' +
        '',
        o:{
            command:'remove_product_from_cart',
            params:{
                product_id:{
                    required:true,
                    default:'',
                    validation:'notNull',
                    description: 'Необходимо передать № продукта.'
                },
                product_count:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: 'Можно удалить несколько'
                }
            }
        }
    },
    clear_cart: {
        name:'clear_cart',
        name_ru:'Очистить корзину',
        description:'',
        responseJSON:
        '' +
        '\nНет примера\n' +
        '',
        o:{
            command:'clear_cart',
            params:{}
        }
    },
    create_order: {
        name:'create_order',
        name_ru:'Создать заказ',
        description:'',
        responseJSON:
        '' +
        '\nНет примера\n' +
        '',
        o:{
            command:'create_order',
            params:{
                phone:{
                    required:true,
                    default:'',
                    validation:'notNull',
                    description: 'Необходимо передать номер телефона.'
                },
                email:{
                    required:true,
                    default:'',
                    validation:'notNull',
                    description: 'Необходимо передать email.'
                },
                order_payment_type_sysname:{
                    required:false,
                    default:'',
                    validation:'notNull',
                    description: ''
                }
            }
        }
    }
};