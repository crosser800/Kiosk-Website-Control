-- Widen reward_target_type CHECK constraints to allow the new
-- 'same_product_different_variant' Freebie reward target value.
-- Purely additive: no column/type changes, no data loss.
-- Existing 'same_item' and 'different_item' rows are unaffected.

ALTER TABLE product_surcharges
  DROP CONSTRAINT product_surcharges_reward_target_type_check,
  ADD CONSTRAINT product_surcharges_reward_target_type_check
    CHECK (reward_target_type = ANY (ARRAY['same_item'::text, 'same_product_different_variant'::text, 'different_item'::text]));

ALTER TABLE product_surcharge_classes
  DROP CONSTRAINT product_surcharge_classes_reward_target_type_check,
  ADD CONSTRAINT product_surcharge_classes_reward_target_type_check
    CHECK (reward_target_type = ANY (ARRAY['same_item'::text, 'same_product_different_variant'::text, 'different_item'::text]));
