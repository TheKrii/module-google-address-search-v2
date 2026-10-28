<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Block\Adminhtml\Form\Field;

use Magento\Config\Block\System\Config\Form\Field\FieldArray\AbstractFieldArray;
use Magento\Framework\DataObject;
use Magento\Framework\Exception\LocalizedException;

/**
 * Dynamic rows editor for Google address component => form field mappings.
 */
class FieldMapping extends AbstractFieldArray
{
    private ?FormColumn $formRenderer = null;

    protected function _prepareToRender(): void
    {
        $this->addColumn('form', [
            'label' => __('Form'),
            'renderer' => $this->getFormRenderer(),
        ]);
        // Narrow columns so the table fits the config form without squeezing the label column
        $this->addColumn('countries', [
            'label' => __('Countries'),
            'class' => 'input-text',
            'style' => 'width:70px',
        ]);
        $this->addColumn('field', [
            'label' => __('Target Field'),
            'class' => 'required-entry input-text',
            'style' => 'width:100px',
        ]);
        $this->addColumn('template', [
            'label' => __('Template'),
            'class' => 'required-entry input-text',
            'style' => 'width:190px',
        ]);
        $this->_addAfter = false;
        $this->_addButtonLabel = (string)__('Add Mapping');
    }

    /**
     * @throws LocalizedException
     */
    protected function _prepareArrayRow(DataObject $row): void
    {
        $options = [];
        $form = (string)$row->getData('form');
        $options['option_' . $this->getFormRenderer()->calcOptionHash($form)] = 'selected="selected"';
        $row->setData('option_extra_attrs', $options);
    }

    /**
     * @throws LocalizedException
     */
    private function getFormRenderer(): FormColumn
    {
        if ($this->formRenderer === null) {
            /** @var FormColumn $renderer */
            $renderer = $this->getLayout()->createBlock(
                FormColumn::class,
                '',
                ['data' => ['is_render_to_js_template' => true]]
            );
            $this->formRenderer = $renderer;
        }

        return $this->formRenderer;
    }
}
