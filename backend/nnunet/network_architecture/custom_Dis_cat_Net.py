from nnunet.network_architecture.transunet.trans_disunet_grpah_transfuse import TransUnet_dis_graph_transfuse

def custom_net(n_classes=4):
    return TransUnet_dis_graph_transfuse(n_classes=n_classes)

def create_model(n_classes=4):
    return custom_net(n_classes=n_classes)
