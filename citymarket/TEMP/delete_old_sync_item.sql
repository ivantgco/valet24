begin
	declare last_update_dt datetime;
	set last_update_dt = get_full_update_last_datetime();
	delete from sync_file_item where updated < last_update_dt;
	delete from sync_file where updated < last_update_dt;
end
