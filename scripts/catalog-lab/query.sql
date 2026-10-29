-- LOCAL SELECT PROTOTYPE, NOT public.catalog_page_v1 AND NOT A MIGRATION.
-- Only pg_temp fixtures; no project tables, mutating RPCs, bids or private ledger.
-- Parameters: category,type,normalized search,min,max,cursor UTC,cursor price,
-- cursor UUID,page size. Strict full request/fingerprint validation is still JS
-- in this runner. A real RPC MUST repeat validation on the SERVER.
-- Type both cursor branches even when the chosen ORDER does not use one key.
with cursor_types as (select $6::timestamptz time_key,$7::bigint price_key), effective as (
 select p.id,p.title,p.category,p.sale_type,p.created_at,
  case when p.sale_type in('fixed','offers') then p.price
   when a.id is not null and a.product_id=p.id and a.seller_id=p.owner_id
    and a.initial_price between 1 and 1000000 and a.revision>0
    and a.status in('scheduled','active','ended_no_bids','ended_winner','cancelled')
   then case when a.bid_count=0 and a.highest_amount is null then a.initial_price
    when a.bid_count>0 and a.highest_amount between 1 and 1000000 then a.highest_amount end
  end effective_price
 from pg_temp.catalog_products p left join pg_temp.catalog_auctions a
  on a.product_id=p.id and p.sale_type='auction'
), matching as (
 select * from effective where effective_price between 1 and 1000000
  and ($1::text is null or category=$1)
  and ($2::text='all' or sale_type=$2)
  and ($3::text='' or pg_temp.catalog_key_v1(title) collate "C"
    like pg_temp.catalog_like_literal($3) escape '!')
  and ($4::bigint is null or effective_price>=$4)
  and ($5::bigint is null or effective_price<=$5)
)
select id,title,category,sale_type,effective_price,
 to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at
from matching
where ($8::uuid is null or /*__CURSOR__*/)
order by /*__ORDER__*/
limit least(greatest($9::integer,1),12)+1
