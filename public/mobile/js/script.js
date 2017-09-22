$(document).ready(() => {
	let states = ['orders', 'products', 'info'];

	let setState = (state) => {
		$('body').attr('data-state', state);
	};


	let orders = {
		loading: false,
		has_more: true,
		page_no: 1,
		limitPerPage: 15,

		active_order: null,
		list: [],

		loadOrders: function (next_page) {
			if (!this.loading) {
				this.loading = true;

				if (next_page) this.page_no++;

				try {
					let o = {
						command: 'get',
						object: 'order_',
						params: {
							page_no: this.page_no,
							limit: this.limitPerPage,
							collapseData: false
						}
					};

					socketQuery(o, (res) => {
						if (res) {
							this.has_more = res.length >= this.limitPerPage;

							if (this.page_no === 1) {
								this.list = res;
							} else {
								this.list = this.list.concat(res);
							}

							this.renderOrders();
						} else {
							if (toastr) {
								toastr['error']('Не удалось загрузить заказы');
							}
						}

						this.loading = false;
					});
				} catch (e) {
					this.loading = false;
				}
			}
		},
		renderOrders: function () {
			if (this.page_no === 1) {
				$('.orders_list ul').html('');
				$('.orders_list').scrollTop(0);
			}
			if (this.list.length < 1) $('.orders_list ul').html('<h1>Нет заказов</h1>');

			for (let i = (this.page_no - 1) * this.limitPerPage;
			     i < this.page_no * this.limitPerPage && i < this.list.length; i++) {
				try {
					let order = this.list[i];

					let datetime = moment(order.created, "DD.MM.YYYY HH:mm:ss");

					let orderHTML =
						`<li data-status="` + order.order_status_sysname.toLowerCase() + `" data-ind="` + i + `">
							<div class="top">
								<span class="small_label number">#` + order.id + `</span>
								<span class="small_label date">` + datetime.format('DD.MM.YYYY') + `</span>
								<span class="small_label time">` + datetime.format('HH:ss') + `</span>
								<span class="small_label status">` + order.order_status + `</span>
							</div>
							<div class="middle">
								<span class="big_label name">` + order.name + `</span>
								<span class="big_label date">` + order.phone + `</span>
								<span class="big_label price">` + order.amount + ` руб.</span>
							</div>
							<div class="bottom">
								<span class="small_label address">` + order.address + `</span>
								<span class="small_label change">
									<label>Изменить статус</label>
									<select class="statuses" data-ind="` + i + `" data-id="` + order.id + `">` + this.statusesHTML + `</select>
								</span>
							</div>
						</li>`;

					$('.orders_list ul').append(orderHTML);
				} catch (e) {
					console.log(e);
				}
			}
		},

		openOrder: function (ind) {
			if (!isNaN(ind) && ind >= 0 && ind < this.list.length) {
				try {
					this.active_order = this.list[ind];

					$('.order_n_name').html("#" + this.active_order.id + "&nbsp;&nbsp;" + this.active_order.name);

					this.loadProducts();
				} catch (e) {
					console.log(e);

					toastr['error']('Не удалось открыть заказ');
				}
			} else {
				toastr['error']('Неправильный индекс заказа');
			}
		},
		loadProducts: function () {
			if (this.active_order && 'id' in this.active_order) {
				let o = {
					command: 'get',
					object: 'product_in_order',
					params: {
						param_where: {
							order_id: this.active_order.id
						},
						collapseData: false
					}
				};

				socketQuery(o, (res) => {
					if (res) {
						this.active_order.products = res;

						this.renderProducts();
					} else {
						if (toastr) {
							toastr['error']('Не удалось загрузить продукты');
						}
					}
				});
			} else {
				if (toastr) {
					toastr['error']('Неправильный формат заказа');
				}
			}
		},
		renderProducts: function () {
			console.log(this.active_order);

			setState(states[1]);
			$('ul.state_products').html('');
			$('ul.state_products').scrollTop(0);

			if ('products' in this.active_order) {
				let products = this.active_order.products;
				if (products.length < 1) $('ul.state_products').html('<h1>Нет продуктов</h1>');

				for (let i = 0; i < products.length; i++) {
					try {
						let product = products[i];

						let sum = parseFloat(product.price) * parseFloat(product.product_count);

						let productHTML =
							`<li>
								<div class="product_img">
									<span class="small_label">#` + product.product_id + `</span>
									<img src="http://valet24.ru/images_new/` + product.image + `.jpg">
								</div>
								<div class="product_info">
									<div class="small_label product_category">` + product.parent_category + `</div>
									<div class="big_label product_title">` + product.name + `</div>
									<div class="product_property">
										<span class="small_label product_property_title">Цена:</span>
										<span class="big_label product_property_value">` + product.price + ` руб.</span>
									</div>
									<div class="product_property">
										<span class="small_label product_property_title">Кол-во:</span>
										<span class="big_label product_property_value">` + product.product_count + ` ` + product.qnt_type + `</span>
									</div>
									<div class="product_property">
										<span class="small_label product_property_title">Итого:</span>
										<span class="big_label product_property_value big">` + sum.toFixed(2) + ` руб.</span>
									</div>
								</div>
								<div class="product_check">
									<i class="fa fa-check" aria-hidden="true"></i>
								</div>
							</li>`;

						$('ul.state_products').append(productHTML);
					} catch (e) {
						console.log(e);
					}
				}
			} else {
				if (toastr) {
					toastr['error']('Заказ пустой');
				}
			}

			$('.menu_item.products span').html('(0/' + +$('.state_products li').length + ')');

			let datetime = moment(this.active_order.created, "DD.MM.YYYY HH:mm:ss");

			$('.state_info .number').html('#' + this.active_order.id);
			$('.state_info .name').html(this.active_order.name);
			$('.state_info .phone').html(this.active_order.phone);
			$('.state_info .date').html(datetime.format('DD.MM.YYYY'));
			$('.state_info .time').html(datetime.format('HH:ss'));
			$('.state_info .email').html(this.active_order.email);
			$('.state_info .order_property').attr('data-status', this.active_order.order_status_sysname.toLowerCase());
			$('.state_info .status').html(this.active_order.order_status);

			let products_price = parseFloat(this.active_order.amount) || 0;
			let delivery_price = this.active_order.delivery_price || 0;
			$('.state_info .products_n').html(this.active_order.product_count);
			$('.state_info .products_price').html(products_price.toFixed(2) + ' руб.');
			$('.state_info .delivery_price').html(delivery_price + ' руб.');
			$('.state_info .prop_value.sum').html((products_price + delivery_price).toFixed(2) + ' руб.');
			$('.state_info .payment_type').html(this.active_order.order_payment_type);

			$('.address_info .address').html(this.active_order.address);
			$('.address_info .gate').html(this.active_order.gate);
			$('.address_info .gatecode').html(this.active_order.gatecode);
			$('.address_info .level').html(this.active_order.level);
			$('.address_info .flat').html(this.active_order.flat);
			$('.address_info .comment').html(this.active_order.comment);
		},

		statusesHTML: '',
		getStatuses: function (callback) {
			let o = {
				command: 'get',
				object: 'order_status',
				params: {
					collapseData: false
				}
			};

			socketQuery(o, (res) => {
				if (res) {
					res.forEach((status) => {
						this.statusesHTML += `<option value="` + status.id + `">` + status.name + `</option>`
					});

					$('.state_info select.statuses').html(this.statusesHTML);
					if (callback) callback.call(this)
				} else {
					if (toastr) {
						toastr['error']('Не удалось загрузить статусы');
					}
				}
			});
		}
	};

	orders.getStatuses(orders.loadOrders);


	//Вернуться на "Заказы"
	$('header .fa-chevron-left').off('click').on('click', () => {
		setState(states[0]);
	});

	//Переключиться на "Товары"
	$('.state_order.products').off('click').on('click', () => {
		setState(states[1]);
	});

	//Переключиться на "Информацию"
	$('.state_order.info').off('click').on('click', () => {
		setState(states[2]);
	});

	//Очистить строку поиска
	$('.clear_search').off('click').on('click', () => {
		$('input.search').val('');
		orders.loadOrders();
	});

	//Выполнить поиск
	$('input.search').on('keyup', (e) => {
		let search_query = $(e.currentTarget).val();

		console.log(search_query);

		let o = {
			command: 'get',
			object: 'order_',
			params: {
				where: [
					{
						group: 'valetMobileSearch',
						comparisonType: 'OR',
						key: 'phone',
						type: 'like',
						val1: search_query
					},
					{
						group: 'valetMobileSearch',
						comparisonType: 'OR',
						key: 'id',
						type: 'like',
						val1: search_query
					}
				],
				collapseData: false
			}
		};

		socketQuery(o, (res) => {
			console.log('search_query', res);

			if (res) {
				orders.page_no = 1;
				orders.list = res;
				orders.renderOrders();
			} else {
				if (toastr) {
					toastr['error']('Ошибка при поиске');
				}
			}
		});
	});

	//Просмотр фото
	$(document).off('click', '.product_img').on('click', '.product_img', (e) => {
		$(e.currentTarget).toggleClass('enlarged');
	});

	// Открыть заказ
	$(document).off('click', '.orders_list li').on('click', '.orders_list li', (e) => {
		if ($(e.target).closest('.change').length > 0) return;

		let ind = +$(e.currentTarget).attr('data-ind');

		orders.openOrder(ind);
	});

	//Выводить кол-во прокликанных товаров
	$(document).off('click', '.state_products li').on('click', '.state_products li', (e) => {
		$(e.currentTarget).toggleClass('checked');

		let n = $('.state_products li').length;
		let n_checked = $('.state_products li.checked').length;

		$('.menu_item.products span').html('(' + +n_checked + '/' + +n + ')');
	});

	$('.orders_list').scroll(function (e) {
		let scroll = $(this).scrollTop();
		let window_h = $(e.currentTarget).height();
		let doc_h = $(e.currentTarget).find('ul').height();

		let load = scroll + window_h > doc_h * 0.8;

		if (load && orders.has_more) orders.loadOrders(true);
	});
});