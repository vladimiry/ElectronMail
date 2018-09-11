import {View} from "src/shared/model/database";

// TODO make "DbViewUtil" injectable service and utilize it accordingly
export class DbViewUtil {
    static trackByEntityPk(index: number, {pk}: View.Folder | View.Mail) {
        return pk;
    }
}
