begin
  declare dt datetime;
  select updated into dt from sync_file sf where id in (
    select t2.sync_file_id from (
      select t1.sync_file_id, sum(t1.num) as item_count from
      (
        select sync_file_id, 1 as num, deleted from sync_file_item where deleted is null
      ) as t1
      where t1.deleted is null
      group by t1.sync_file_id
      order by item_count desc
    ) as t2
    where t2.item_count > 5000
  )
  order by updated desc
  limit 1;
  return dt;
end
