begin
	declare last_update_dt datetime;
	set last_update_dt = get_full_update_last_datetime();
	update product set is_active = 0
	where updated < last_update_dt
	and is_active = 1
	and ignore_quantity = 0;
end
