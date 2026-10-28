<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Backend;

use Magento\Framework\App\Config\Value;
use Magento\Framework\Exception\LocalizedException;
use Vaimo\GoogleAddressSearchV2\Model\Config;

class Countries extends Value
{
    public function beforeSave()
    {
        $value = $this->getValue();
        $codes = is_array($value) ? $value : explode(',', (string)$value);
        $codes = array_values(array_unique(array_filter(array_map('trim', $codes), 'strlen')));

        if (count($codes) > Config::MAX_REGION_CODES) {
            throw new LocalizedException(__(
                'Google Places accepts at most %1 countries per request. %2 were selected.',
                Config::MAX_REGION_CODES,
                count($codes)
            ));
        }

        $this->setValue(implode(',', $codes));

        return parent::beforeSave();
    }
}
