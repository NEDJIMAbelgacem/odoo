# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.addons.hr_expense.tests.common import TestExpenseCommon
from odoo.exceptions import AccessError, UserError
from odoo.tests import HttpCase, tagged, new_test_user


@tagged('-at_install', 'post_install')
class TestExpensesAccessRights(TestExpenseCommon, HttpCase):

    def test_expense_access_rights(self):
        ''' The expense employee can't be able to create an expense for someone else.'''

        expense_employee_2 = self.env['hr.employee'].create({
            'name': 'expense_employee_2',
            'user_id': self.env.user.id,
            'work_contact_id': self.env.user.partner_id.id,
        })

        with self.assertRaises(AccessError):
            self.env['hr.expense'].with_user(self.expense_user_employee).create({
                'name': "Superboy costume washing",
                'employee_id': expense_employee_2.id,
                'product_id': self.product_a.id,
                'quantity': 1,
                'price_unit': 1,
            })

    def test_expense_sheet_access_rights(self):
        # The expense employee is able to a create an expense sheet.

        expense_sheet_approve = self.env['hr.expense.sheet'].with_user(self.expense_user_employee).create({
            'name': 'First Expense for employee',
            'employee_id': self.expense_employee.id,
            'journal_id': self.company_data['default_journal_purchase'].id,
            'accounting_date': '2017-01-01',
            'expense_line_ids': [Command.create({
                # Expense without foreign currency but analytic account.
                'name': 'expense_1',
                'date': '2016-01-01',
                'product_id': self.product_a.id,
                'price_unit': 1000.0,
                'employee_id': self.expense_employee.id,
            })],
        })

        expense_sheet_refuse = self.env['hr.expense.sheet'].with_user(self.expense_user_employee).create({
            'name': 'First Expense for employee',
            'employee_id': self.expense_employee.id,
            'journal_id': self.company_data['default_journal_purchase'].id,
            'accounting_date': '2017-01-01',
            'expense_line_ids': [Command.create({
                # Expense without foreign currency but analytic account.
                'name': 'expense_1',
                'date': '2016-01-01',
                'product_id': self.product_a.id,
                'price_unit': 1000.0,
                'employee_id': self.expense_employee.id,
            })],
        })
        sheets = expense_sheet_approve | expense_sheet_refuse

        self.assertRecordValues(sheets, [{'state': 'draft'}, {'state': 'draft'}])

        # The expense employee is able to submit the expense sheet.
        sheets.with_user(self.expense_user_employee).action_submit_sheet()
        self.assertRecordValues(sheets, [{'state': 'submit'}, {'state': 'submit'}])

        # The expense employee is not able to approve itself the expense sheet.
        with self.assertRaises(UserError):
            expense_sheet_approve.with_user(self.expense_user_employee).action_approve_expense_sheets()

        with self.assertRaises(UserError):
            expense_sheet_refuse.with_user(self.expense_user_employee).action_refuse_expense_sheets()
        self.assertRecordValues(sheets, [{'state': 'submit'}, {'state': 'submit'}])

        # An expense manager is required for this step.
        expense_sheet_approve.with_user(self.expense_user_manager).action_approve_expense_sheets()
        expense_sheet_refuse.with_user(self.expense_user_manager).action_refuse_expense_sheets()
        expense_sheet_refuse.with_user(self.expense_user_manager)._do_refuse('failed')
        self.assertRecordValues(sheets, [{'state': 'approve'}, {'state': 'cancel'}])

        # An expense manager is not able to post the journal entry.
        with self.assertRaises(AccessError):
            expense_sheet_approve.with_user(self.expense_user_manager).action_sheet_move_post()
        self.assertRecordValues(expense_sheet_approve, [{'state': 'approve'}])

        # An expense manager having accounting access rights is able to post the journal entry.
        expense_sheet_approve.with_user(self.env.user).action_sheet_move_post()
        self.assertRecordValues(expense_sheet_approve, [{'state': 'post'}])

    def test_expense_sheet_access_rights_user(self):
        # The expense base user (without other rights) is able to create and read sheet

        user = new_test_user(self.env, login='test-expense', groups='base.group_user')
        expense_employee = self.env['hr.employee'].create({
            'name': 'expense_employee_base_user',
            'user_id': user.id,
            'work_contact_id': user.partner_id.id,
            'address_id': user.partner_id.id,
        })

        expense_sheet = self.env['hr.expense.sheet'].with_user(user).create({
            'name': 'First Expense for employee',
            'employee_id': expense_employee.id,
            'journal_id': self.company_data['default_journal_purchase'].id,
            'accounting_date': '2017-01-01',
            'expense_line_ids': [
                Command.create({
                    # Expense without foreign currency but analytic account.
                    'name': 'expense_1',
                    'date': '2016-01-01',
                    'product_id': self.product_a.id,
                    'price_unit': 1000.0,
                    'employee_id': expense_employee.id,
                }),
            ],
        })
        self.start_tour("/web", 'hr_expense_access_rights_test_tour', login="test-expense")
        self.assertRecordValues(expense_sheet, [{'state': 'submit'}])
