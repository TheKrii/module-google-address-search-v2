<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Backend;

use Magento\Framework\App\Config\Value;
use Magento\Framework\Exception\LocalizedException;

/**
 * Optional value that must match a regex; pattern, label and example are injected via virtual types.
 */
class Pattern extends Value
{
    public function beforeSave()
    {
        $value = trim((string)$this->getValue());

        if ($value !== '' && !preg_match((string)$this->getData('pattern'), $value)) {
            throw new LocalizedException(__(
                '"%1" has an invalid value "%2". Examples: %3. Leave empty to use the store default.',
                __((string)$this->getData('label')),
                $value,
                (string)$this->getData('example')
            ));
        }

        $this->setValue($value);

        return parent::beforeSave();
    }
}
