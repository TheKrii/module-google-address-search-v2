<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Backend;

use Magento\Framework\App\Config\Value;
use Magento\Framework\Exception\LocalizedException;
use Vaimo\GoogleAddressSearchV2\Model\Config;

class PrimaryTypes extends Value
{
    public function beforeSave()
    {
        $types = array_values(array_unique(array_filter(
            array_map(static fn (string $type): string => strtolower(trim($type)), explode(',', (string)$this->getValue())),
            'strlen'
        )));

        foreach ($types as $type) {
            if (!preg_match('/^[a-z0-9_]+$/', $type)) {
                throw new LocalizedException(__('"%1" is not a valid Google place type.', $type));
            }
        }

        if (count($types) > Config::MAX_PRIMARY_TYPES) {
            throw new LocalizedException(__(
                'Google Places accepts at most %1 suggestion place types.',
                Config::MAX_PRIMARY_TYPES
            ));
        }

        $this->setValue(implode(',', $types));

        return parent::beforeSave();
    }
}
